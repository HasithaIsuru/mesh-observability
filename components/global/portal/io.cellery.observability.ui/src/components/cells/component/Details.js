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

import ComponentDependencyView from "./ComponentDependencyView";
import HealthIndicator from "../../common/HealthIndicator";
import HttpUtils from "../../../utils/api/httpUtils";
import {Link} from "react-router-dom";
import NotificationUtils from "../../../utils/common/notificationUtils";
import QueryUtils from "../../../utils/common/queryUtils";
import React from "react";
import StateHolder from "../../common/state/stateHolder";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableRow from "@material-ui/core/TableRow";
import Typography from "@material-ui/core/Typography/Typography";
import withGlobalState from "../../common/state";
import {withStyles} from "@material-ui/core/styles";
import * as PropTypes from "prop-types";

const styles = () => ({
    table: {
        width: "30%",
        marginTop: 25
    },
    tableCell: {
        borderBottom: "none"
    }
});

class Details extends React.Component {

    constructor(props) {
        super(props);

        this.state = {
            isDataAvailable: false,
            health: -1,
            dependencyGraphData: [],
            isLoading: false,
            ingressTypes: []
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

    update = (isUserAction, queryStartTime, queryEndTime) => {
        const {globalState, cell, component} = this.props;
        const self = this;

        const search = {
            queryStartTime: queryStartTime.valueOf(),
            queryEndTime: queryEndTime.valueOf(),
            destinationInstance: cell,
            destinationComponent: component,
            includeIntraInstance: true
        };

        const ingressQueryParams = {
            queryStartTime: queryStartTime.valueOf(),
            queryEndTime: queryEndTime.valueOf()
        };

        if (isUserAction) {
            NotificationUtils.showLoadingOverlay("Loading Component Info", globalState);
            self.setState({
                isLoading: true
            });
        }
        const componentMetricPromise = HttpUtils.callObservabilityAPI(
            {
                url: `/http-requests/instances/components/metrics/${HttpUtils.generateQueryParamString(search)}`,
                method: "GET"
            },
            globalState
        );
        const generatedQueryParam = HttpUtils.generateQueryParamString(ingressQueryParams);
        const IngressDataPromise = HttpUtils.callObservabilityAPI(
            {
                url: `/k8s/instances/${cell}/components/${component}${generatedQueryParam}`,
                method: "GET"
            },
            globalState
        );
        Promise.all([componentMetricPromise, IngressDataPromise]).then((data) => {
            const ingressData = data[1];
            self.loadComponentInfo(data[0]);
            for (let i = 0; i < ingressData.length; i++) {
                const responseData = ingressData[i];
                self.setState({
                    ingressTypes: responseData[2].split(",")
                });
            }
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

    loadComponentInfo = (data) => {
        const self = this;
        const aggregatedData = data.map((datum) => ({
            isError: datum[1] === "5xx",
            count: datum[5]
        })).reduce((accumulator, currentValue) => {
            if (currentValue.isError) {
                accumulator.errorsCount += currentValue.count;
            }
            accumulator.total += currentValue.count;
            return accumulator;
        }, {
            errorsCount: 0,
            total: 0
        });

        let health;
        if (aggregatedData.total > 0) {
            health = 1 - aggregatedData.errorsCount / aggregatedData.total;
        } else {
            health = -1;
        }
        self.setState({
            health: health,
            isDataAvailable: aggregatedData.total > 0
        });
    };

    render() {
        const {classes, cell, component} = this.props;
        const {health, isLoading, ingressTypes} = this.state;
        const ingressListStr = ingressTypes.toString().replace(/,/g, ", ");

        const view = (
            <Table className={classes.table}>
                <TableBody>
                    <TableRow>
                        <TableCell className={classes.tableCell}>
                            <Typography color="textSecondary">
                                Health
                            </Typography>
                        </TableCell>
                        <TableCell className={classes.tableCell}>
                            <HealthIndicator value={health}/>
                        </TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell className={classes.tableCell}>
                            <Typography color="textSecondary">
                                Instance
                            </Typography>
                        </TableCell>
                        <TableCell className={classes.tableCell}>
                            <Link to={`/instances/${cell}`}>{cell}</Link>
                        </TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell className={classes.tableCell}>
                            <Typography color="textSecondary">
                                Ingress Types
                            </Typography>
                        </TableCell>
                        <TableCell className={classes.tableCell}>
                            <p>{ingressListStr ? ingressListStr : "Not Available"}</p>
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        );

        return (
            <React.Fragment>
                {isLoading ? null : view}
                <ComponentDependencyView cell={cell} component={component}/>
            </React.Fragment>
        );
    }

}

Details.propTypes = {
    classes: PropTypes.object.isRequired,
    cell: PropTypes.string.isRequired,
    component: PropTypes.string.isRequired,
    globalState: PropTypes.instanceOf(StateHolder).isRequired
};

export default withStyles(styles)(withGlobalState(Details));
