"use strict";
/// <reference path="../types/yaml.d.ts" />
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const npm_autoloader_1 = require("npm-autoloader");
const pkg_dir_1 = __importDefault(require("pkg-dir"));
const path_1 = __importDefault(require("path"));
const log_1 = __importDefault(require("./log"));
const config_1 = require("./config");
const project_1 = __importDefault(require("./project"));
class PackageYamlCmd extends npm_autoloader_1.NPMExtensionCommand {
    constructor() {
        super(...arguments);
        this.usage = "npm package-yaml use-yaml\n"
            + "npm package-yaml use-json";
    }
    execute(args) {
        log_1.default.verbose("PackageYamlCommand", "called with args: %j", args);
        const project = new project_1.default(this.npm.config.localPrefix);
        if (args[0] && args[0].startsWith('use-')) {
            project.config.updateAndLock({ conflicts: args[0] });
        }
        const syncResult = project.sync();
        if (syncResult === 'ask') {
            console.error("Could not sync package.yaml and package.json. Try executing one of:\n"
                + "  npm package-yaml use-yaml\n"
                + "  npm package-yaml use-json");
        }
    }
}
function syncPackageYaml(projectDir) {
    log_1.default.verbose("syncPackageYaml", "loading, projectDir: %s", projectDir);
    try {
        const syncResult = new project_1.default(projectDir).sync();
        if (syncResult !== true) {
            return false; // let the caller tell the client what to do
        }
        process.on('exit', function () {
            new project_1.default(projectDir).sync(config_1.ConflictResolution.useJson);
        });
        return true;
    }
    catch (e) {
        log_1.default.error("syncPackageYaml", "Unexpected error: %s", e);
        return false;
    }
}
function _npm_autoload(npm, command) {
    log_1.default.verbose("_npm_autoloader", "called via npm-autoloader");
    npm.commands['package-yaml'] = new PackageYamlCmd(npm);
    if (command == "package-yaml") {
        log_1.default.verbose("_npm_autoloader", "not automatically syncing because of package-yaml command");
        return;
    }
    if (!syncPackageYaml(npm.config.localPrefix)) {
        console.error("Could not sync package.yaml and package.json, aborting. Try executing one of:\n"
            + "  npm package-yaml use-yaml\n"
            + "  npm package-yaml use-json\n"
            + "and then try this command again.");
        npm_autoloader_1.npmExit(1);
    }
}
exports._npm_autoload = _npm_autoload;
const mainModule = (module.parent && module.parent.filename === path_1.default.resolve(__dirname, '../index.js'))
    ? module.parent
    : module;
if (npm_autoloader_1.calledFromNPM(mainModule)) {
    log_1.default.verbose("(main)", "called via onload-script");
    const npm = npm_autoloader_1.getNPM(mainModule);
    if (!syncPackageYaml(npm.config.localPrefix)) {
        let cmdline = "[args...]";
        if (process.argv.slice(2).every(arg => /^[a-zA-Z0-9_.,\/-]+$/.test(arg))) {
            cmdline = process.argv.slice(2).join(" ");
        }
        console.error("Could not sync package.yaml and package.json. Try executing one of:\n"
            + `  PACKAGE_YAML_FORCE=yaml npm ${cmdline}\n`
            + `  PACKAGE_YAML_FORCE=json npm ${cmdline}\n`
            + "and then try this command again.");
        npm_autoloader_1.npmExit(1);
    }
}
else if (!mainModule.parent) {
    log_1.default.verbose("(main)", "called directly from command line");
    const dir = pkg_dir_1.default.sync();
    if (dir) {
        syncPackageYaml(dir);
    }
    else {
        log_1.default.verbose("(main)", "Cannot find project dir, aborting");
    }
}
else {
    log_1.default.verbose("(main)", "not main module");
}
