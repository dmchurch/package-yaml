/// <reference path="../types/yaml.d.ts" />

import { calledFromNPM, getNPM, NPMExtensionCommand, npmExit } from 'npm-autoloader';
import pkgDir from 'pkg-dir';
import path from 'path';

import log from './log';
import { ConflictResolution } from './config';
import Project from './project';

class PackageYamlCmd extends NPMExtensionCommand {
    execute(args:string[]):any {
        log.verbose("PackageYamlCommand", "called with args: %j", args);
        const project = new Project(this.npm.config.localPrefix);
        if (args[0] && args[0].startsWith('use-')) {
            project.config.updateAndLock({conflicts:args[0] as ConflictResolution});
        }
        const syncResult = project.sync();
        if (syncResult === 'ask') {
            console.error("Could not sync package.yaml and package.json. Try executing one of:\n"
            +"  npm package-yaml use-yaml\n"
            +"  npm package-yaml use-json");
        }
    }

    usage = "npm package-yaml use-yaml\n"
          + "npm package-yaml use-json";
}

function syncPackageYaml(projectDir: string):boolean {
    log.verbose("syncPackageYaml", "loading, projectDir: %s", projectDir);
    try {
        const syncResult = new Project(projectDir).sync();
        if (syncResult !== true) {
            return false; // let the caller tell the client what to do
        }
        process.on('exit', function() {
            new Project(projectDir).sync(ConflictResolution.useJson);
        });
        return true;
    } catch (e) {
        log.error("syncPackageYaml", "Unexpected error: %s", e);
        return false;
    }
}

export function _npm_autoload(npm: NPM.Static, command:string) {
    log.verbose("_npm_autoloader","called via npm-autoloader");
    npm.commands['package-yaml'] = new PackageYamlCmd(npm);

    if (command == "package-yaml") {
        log.verbose("_npm_autoloader","not automatically syncing because of package-yaml command");
        return;
    }
    if (!syncPackageYaml(npm.config.localPrefix)) {
        console.error("Could not sync package.yaml and package.json, aborting. Try executing one of:\n"
                        +"  npm package-yaml use-yaml\n"
                        +"  npm package-yaml use-json\n"
                        +"and then try this command again.");
        npmExit(1);
    }
}

const mainModule = (module.parent && module.parent.filename === path.resolve(__dirname,'../index.js'))
                 ? module.parent
                 : module;

if (calledFromNPM(mainModule)) {
    log.verbose("(main)", "called via onload-script");
    const npm = getNPM(mainModule);
    if (!syncPackageYaml(npm.config.localPrefix)) {
        let cmdline = "[args...]";
        if (process.argv.slice(2).every(arg=>/^[a-zA-Z0-9_.,\/-]+$/.test(arg))) {
            cmdline = process.argv.slice(2).join(" ");
        }
        console.error("Could not sync package.yaml and package.json. Try executing one of:\n"
        +`  PACKAGE_YAML_FORCE=yaml npm ${cmdline}\n`
        +`  PACKAGE_YAML_FORCE=json npm ${cmdline}\n`
        +"and then try this command again.");
        npmExit(1);
    }
} else if (!mainModule.parent) {
    log.verbose("(main)","called directly from command line");
    const dir = pkgDir.sync();
    if (dir) {
        syncPackageYaml(dir);
    } else {
        log.verbose("(main)","Cannot find project dir, aborting");
    }
} else {
    log.verbose("(main)","not main module");
}
