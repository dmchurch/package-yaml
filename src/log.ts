import npmlog from 'npmlog';

const oldNpmlog = require.cache[require.resolve("npmlog")];
delete require.cache[require.resolve("npmlog")];

const log = require("npmlog") as npmlog.Logger;
delete require.cache[require.resolve("npmlog")];

if (oldNpmlog) {
    require.cache[require.resolve("npmlog")] = oldNpmlog;
}

log.heading = 'package-yaml';
if (!!process.env.DEBUG_PACKAGE_YAML) {
    log.level = 'verbose';
}

export default log;