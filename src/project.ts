import fs from 'fs';
import path from 'path';
import log from './log';
import { diff, Diff } from 'deep-diff';
import yaml from 'yaml';

import { Config, ConflictResolution } from './config';
import { loadAndParse, patchYamlDocument, patchObject } from './utils';

export default class Project {
    readonly projectDir: string;
    yamlExtension: string | null;

    readonly config = new Config();

    get jsonName() {
        return "package.json";
    }

    get yamlName() {
        return `package.${this.yamlExtension || this.config.defaultExtension}`;
    }

    projectPath(localPath: string): string {
        return path.join(this.projectDir, localPath);
    }
    get jsonPath() {
        return this.projectPath(this.jsonName);
    }

    get yamlPath() {
        return this.projectPath(this.yamlName);
    }

    readonly jsonExists:boolean;
    readonly yamlExists:boolean;

    yamlModified:boolean = false;
    jsonModified:boolean = false;

    private _jsonContents?:object;
    private _yamlDocument?:yaml.ast.Document;

    get jsonContents():object {
        if (this._jsonContents) return this._jsonContents;
        if (this.jsonExists) {
            try {
                return this._jsonContents = loadAndParse(this.jsonPath, JSON.parse);
            } catch (e) {
                log.error("loadJson", "Cannot load or parse %s: %s", this.jsonPath, e);
                throw e;
            }
        } else {
            return this._jsonContents = {};
        }
    }
    set jsonContents(value:object) {
        if (diff(this._jsonContents, value)) {
            this.jsonModified = true;
        }
        this._jsonContents = value;
    }

    get yamlDocument():yaml.ast.Document {
        if (this._yamlDocument) return this._yamlDocument;
        if (this.yamlExists) {
            try {
                return this._yamlDocument = loadAndParse(this.yamlPath, yaml.parseDocument);
            } catch (e) {
                log.error("loadYaml", "Cannot load or parse %s: %s", this.yamlPath, e);
                throw e;
            }
        } else {
            return this._yamlDocument = new yaml.Document();
        }
    }
    set yamlDocument(value:yaml.ast.Document) {
        if (this._yamlDocument !== value) {
            this.yamlModified = true;
        }
        this._yamlDocument = value;
    }

    get yamlContents():object {
        return this.yamlDocument.toJSON();
    }

    backupPath(filename:string): string {
        const fullPath = this.projectPath(filename).replace(/\//g, '%');
        const backupPath = this.config.backupPath
            .replace("%s", filename)
            .replace("%S", fullPath);
        return path.resolve(this.projectDir, backupPath);
    }

    constructor(projectDir: string) {
        this.projectDir = projectDir;
        this.yamlExtension =
            fs.existsSync(this.projectPath('package.yaml')) ? 'yaml' :
            fs.existsSync(this.projectPath('package.yml')) ? 'yml' :
            null;
        this.config.loadConfigFile(this.projectPath("package-yaml.json"));
        this.config.loadConfigFile(this.projectPath("package-yaml.yaml"));
        this.config.loadConfigFile(this.jsonPath, "package-yaml");
        this.config.loadConfigFile(this.yamlPath, "package-yaml");
        this.jsonExists = fs.existsSync(this.jsonPath);
        this.yamlExists = fs.existsSync(this.yamlPath);
    }

    writeBackups():boolean {
        let success = true;
        if (!this.config.writeBackups) return success;
        try {
            fs.writeFileSync(this.backupPath(this.jsonName),JSON.stringify(this.jsonContents, null, 4));
        } catch (e) {
            success = false;
            log.warn("writeBackups", "Error writing backup package.json file at %s: %s", this.backupPath(this.jsonName), e);
        }
        try {
            fs.writeFileSync(this.backupPath(this.yamlName),this.yamlDocument.toString());
        } catch (e) {
            success = false;
            log.warn("writeBackups", "Error writing backup %s file at %s: %s", this.yamlName, this.backupPath(this.yamlName), e);
        }
        return success;
    }

    writePackageFiles():boolean {
        let success = true;
        if (this.yamlModified) {
            try {
                fs.writeFileSync(this.yamlPath, this.yamlDocument.toString());
                this.yamlModified = false;
            } catch (e) {
                success = false;
                log.error("writePackageFiles", "Error writing %s: %s", this.yamlPath, e);
            }
        }
        if (this.jsonModified) {
            try {
                fs.writeFileSync(this.jsonPath, JSON.stringify(this.jsonContents, null, 4));
                this.jsonModified = false;
            } catch (e) {
                success = false;
                log.error("writePackageFiles", "Error writing %s: %s", this.jsonPath, e);
            }
        }
        return success;
    }

    patchYaml(diff: Diff<any,any>[] | null | undefined): yaml.ast.Document {
        if (diff) {
            this.yamlDocument = patchYamlDocument(this.yamlDocument, diff);
            this.yamlModified = true;
        }
        return this.yamlDocument;
    }

    patchJson(diff: Diff<any,any>[] | null | undefined): any {
        if (diff) {
            this.jsonContents = patchObject(this.jsonContents, diff);
            this.jsonModified = true;
        }
        return this.jsonContents;
    }

    sync(conflictStrategy?:ConflictResolution):boolean | ConflictResolution.ask {
        conflictStrategy = conflictStrategy || this.config.conflicts;
        if (!diff(this.jsonContents, this.yamlContents)) {
            log.verbose("sync", "Package files already in sync, writing backups");
            this.writeBackups();
            return true;
        }
        log.verbose("sync", "Package files out of sync. Trying to resolve...");
        if (!this.yamlExists) {
            log.verbose("sync", `${this.yamlName} does not exist, creating from package.json`);
            conflictStrategy = ConflictResolution.useJson;
        } else if (!this.jsonExists) {
            log.verbose("sync", `package.json does not exist, using ${this.yamlName}`);
            conflictStrategy = ConflictResolution.useYaml;
        } else if (this.config.writeBackups) {
            log.verbose("sync", "Attempting to read backups...");
            const jsonBackup = loadAndParse(this.backupPath(this.jsonName), JSON.parse, true) || this.jsonContents;
            const yamlBackup = loadAndParse(this.backupPath(this.yamlName), yaml.parse, true) || this.yamlContents;
            if (!diff(this.jsonContents, yamlBackup)) {
                log.verbose("sync", "package.yaml has changed, applying to package.json");
                conflictStrategy = ConflictResolution.useYaml;
            } else if (!diff(this.yamlContents, jsonBackup)) {
                log.verbose("sync", "package.json has changed, applying to package.yaml");
                conflictStrategy = ConflictResolution.useJson;
            } else if (!diff(jsonBackup, yamlBackup) && this.config.tryMerge) {
                log.verbose("sync", "Both json and yaml have changed, attempting merge");
                const jsonDiff = diff(jsonBackup, this.jsonContents);
                const yamlDiff = diff(yamlBackup, this.yamlContents);
                const patchedJson = yamlDiff ? patchObject(JSON.parse(JSON.stringify(this.jsonContents)), yamlDiff) : this.jsonContents;
                const patchedYaml = jsonDiff ? patchObject(this.yamlContents, jsonDiff) : this.yamlContents;
                if (!diff(patchedJson, patchedYaml)) {
                    log.verbose("sync", "Merge successful, continuing")
                    this.patchYaml(jsonDiff);
                    conflictStrategy = ConflictResolution.useYaml;
                } else {
                    log.verbose("sync", "Merge unsuccessful, reverting to default resolution (%s)", conflictStrategy);
                }
            } else {
                log.verbose("sync", "Backup(s) out of sync, reverting to default resolution (%s)", conflictStrategy);
            }
        }

        if (conflictStrategy == ConflictResolution.useLatest) {
            // We know that both yaml and json must exist, otherwise we wouldn't still be
            // set to useLatest
            log.verbose("sync", "Checking timestamps...");
            const jsonTime = fs.statSync(this.jsonPath).mtimeMs / 1000.0;
            const yamlTime = fs.statSync(this.yamlPath).mtimeMs / 1000.0;
            if (Math.abs(yamlTime - jsonTime) <= this.config.timestampFuzz) {
                log.verbose("sync", "Timestamp difference %ss <= fuzz factor %ss, reverting to ask", Math.abs(jsonTime - yamlTime), this.config.timestampFuzz);
                conflictStrategy = ConflictResolution.ask;
            } else if (yamlTime > jsonTime) {
                log.verbose("sync", "%s %ss newer than package.json, overwriting", this.yamlName, yamlTime - jsonTime);
                conflictStrategy = ConflictResolution.useYaml;
            } else {
                log.verbose("sync", "package.json %ss newer than %s, overwriting", jsonTime - yamlTime, this.yamlName);
                conflictStrategy = ConflictResolution.useJson;
            }
        }

        if (conflictStrategy == ConflictResolution.ask) {
            log.verbose("sync", "Cannot sync, returning ask")
            return ConflictResolution.ask;
        }

        if (conflictStrategy == ConflictResolution.useJson) {
            log.verbose("sync", "Patching %s with changes from package.json", this.yamlName);
            this.patchYaml(diff(this.yamlContents, this.jsonContents));
        } else if (conflictStrategy == ConflictResolution.useYaml) {
            log.verbose("sync", "Patching package.json with changes from %s", this.yamlName);
            this.patchJson(diff(this.jsonContents, this.yamlContents));
        }

        this.writeBackups();
        return this.writePackageFiles();
    }
}