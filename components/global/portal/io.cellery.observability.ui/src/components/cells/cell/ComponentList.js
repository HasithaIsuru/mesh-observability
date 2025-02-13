/*
 * Copyright (c) 2018, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Constants from "../../../utils/constants";
import DataTable from "../../common/DataTable";
import HealthIndicator from "../../common/HealthIndicator";
import HttpUtils from "../../../utils/api/httpUtils";
import {Link} from "react-router-dom";
import NotFound from "../../common/error/NotFound";
import NotificationUtils from "../../../utils/common/notificationUtils";
import QueryUtils from "../../../utils/common/queryUtils";
import React from "react";
import StateHolder from "../../common/state/stateHolder";
import withGlobalState from "../../common/state";
import {withStyles} from "@material-ui/core";
import * as PropTypes from "prop-types";

class ComponentList extends React.Component {

    constructor(props) {
        super(props);

        this.state = {
            componentInfo: [],
            isLoading: false
        };
    }

    componentDidMount = () => {
        const {globalState} = this.props;

        this.update(
            true,
            QueryUtils.parseTime(globalState.get(StateHolder.GLOBAL_FILTER).startTime),
            QueryUtils.parseTime(globalState.get(StateHolder.GLOBAL_FILTER).endTime)
        );
    };

    update = (isUserAction, startTime, endTime) => {
        this.loadComponentInfo(isUserAction, startTime, endTime);
    };

    loadComponentInfo = (isUserAction, queryStartTime, queryEndTime) => {
        const {globalState, cell} = this.props;
        const self = this;

        const search = {
            queryStartTime: queryStartTime.valueOf(),
            queryEndTime: queryEndTime.valueOf()
        };

        if (isUserAction) {
            NotificationUtils.showLoadingOverlay("Loading Component Info", globalState);
            self.setState({
                isLoading: true
            });
        }
        HttpUtils.callObservabilityAPI(
            {
                url: `/http-requests/instances/${cell}/components/${HttpUtils.generateQueryParamString(search)}`,
                method: "GET"
            },
            globalState
        ).then((data) => {
            const componentInfo = data.map((dataItem) => ({
                sourceInstance: dataItem[0],
                sourceComponent: dataItem[1],
                destinationInstance: dataItem[2],
                destinationComponent: dataItem[3],
                httpResponseGroup: dataItem[4],
                totalResponseTimeMilliSec: dataItem[5],
                requestCount: dataItem[6]
            }));

            self.setState({
                componentInfo: componentInfo
            });
            if (isUserAction) {
                NotificationUtils.hideLoadingOverlay(globalState);
                self.setState({
                    isLoading: false
                });
            }
        }).catch(() => {
            if (isUserAction) {
                NotificationUtils.hideLoadingOverlay(globalState);
                self.setState({
                    isLoading: false
                });
                NotificationUtils.showNotification(
                    "Failed to load component information",
                    NotificationUtils.Levels.ERROR,
                    globalState
                );
            }
        });
    };

    render = () => {
        const {cell} = this.props;
        const {componentInfo, isLoading} = this.state;
        const columns = [
            {
                name: "Health",
                options: {
                    customBodyRender: (value) => <HealthIndicator value={value}/>
                }
            },
            {
                name: "Component",
                options: {
                    customBodyRender: (value) => <Link to={`/cells/${cell}/components/${value}`}>{value}</Link>
                }
            },
            {
                name: "Inbound Error Rate",
                options: {
                    customBodyRender: (value) => `${Math.round(value * 100)} %`
                }
            },
            {
                name: "Outbound Error Rate",
                options: {
                    customBodyRender: (value) => `${Math.round(value * 100)} %`
                }
            },
            {
                name: "Average Response Time (ms)",
                options: {
                    customBodyRender: (value) => (Math.round(value))
                }
            },
            {
                name: "Average Inbound Request Count (requests/s)"
            }
        ];
        const options = {
            filter: false
        };

        // Processing data to find the required values
        const dataTableMap = {};
        const initializeDataTableMapEntryIfNotPresent = (component) => {
            if (!dataTableMap[component]) {
                dataTableMap[component] = {
                    inboundErrorCount: 0,
                    outboundErrorCount: 0,
                    requestCount: 0,
                    totalResponseTimeMilliSec: 0
                };
            }
        };
        const isComponentRelevant = (consideredCell, component) => (
            !Constants.System.GLOBAL_GATEWAY_NAME_PATTERN.test(component) && consideredCell === cell
        );
        for (const componentDatum of componentInfo) {
            if (isComponentRelevant(componentDatum.sourceInstance, componentDatum.sourceComponent)) {
                initializeDataTableMapEntryIfNotPresent(componentDatum.sourceComponent);

                if (componentDatum.httpResponseGroup === "5xx") {
                    dataTableMap[componentDatum.sourceComponent].outboundErrorCount
                        += componentDatum.requestCount;
                }
            }
            if (isComponentRelevant(componentDatum.destinationInstance, componentDatum.destinationComponent)) {
                initializeDataTableMapEntryIfNotPresent(componentDatum.destinationComponent);

                if (componentDatum.httpResponseGroup === "5xx") {
                    dataTableMap[componentDatum.destinationComponent].inboundErrorCount
                        += componentDatum.requestCount;
                }
                dataTableMap[componentDatum.destinationComponent].requestCount += componentDatum.requestCount;
                dataTableMap[componentDatum.destinationComponent].totalResponseTimeMilliSec
                    += componentDatum.totalResponseTimeMilliSec;
            }
        }

        // Transforming the objects into 2D array accepted by the Table library
        const tableData = [];
        for (const component in dataTableMap) {
            if (dataTableMap.hasOwnProperty(component) && Boolean(component)) {
                const componentData = dataTableMap[component];
                tableData.push([
                    componentData.requestCount === 0
                        ? -1
                        : 1 - componentData.inboundErrorCount / componentData.requestCount,
                    component,
                    componentData.requestCount === 0
                        ? 0
                        : componentData.inboundErrorCount / componentData.requestCount,
                    componentData.requestCount === 0
                        ? 0
                        : componentData.outboundErrorCount / componentData.requestCount,
                    componentData.requestCount === 0
                        ? 0
                        : componentData.totalResponseTimeMilliSec / componentData.requestCount,
                    componentData.requestCount
                ]);
            }
        }

        let listView;
        if (tableData.length > 0) {
            listView = <DataTable columns={columns} options={options} data={tableData}/>;
        } else {
            listView = (
                <NotFound title={"No Components Found"} description={`No Components found in "${cell}" cell.`
                    + `This is because no requests were found between components in "${cell}" cell in the `
                    + "selected time range"}/>
            );
        }

        return (isLoading ? null : listView);
    };

}

ComponentList.propTypes = {
    globalState: PropTypes.instanceOf(StateHolder).isRequired,
    cell: PropTypes.string.isRequired
};

export default withStyles({})(withGlobalState(ComponentList));
