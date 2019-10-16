#!/usr/bin/env node
"use strict";

module.exports = {
    ...require('./dist/index'),
    ...require('./dist/config'),
    Project: require('./dist/project'),
};