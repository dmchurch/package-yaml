"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const log_1 = __importDefault(require("./log"));
const deep_diff_1 = require("deep-diff");
const yaml_1 = __importDefault(require("yaml"));
const config_1 = require("./config");
const utils_1 = require("./utils");
class Project {
    constructor(projectDir) {
        this.config = new config_1.Config();
        this.yamlModified = false;
        this.jsonModified = false;
        this.projectDir = projectDir;
        this.yamlExtension =
            fs_1.default.existsSync(this.projectPath('package.yaml')) ? 'yaml' :
                fs_1.default.existsSync(this.projectPath('package.yml')) ? 'yml' :
                    null;
        this.config.loadConfigFile(this.projectPath("package-yaml.json"));
        this.config.loadConfigFile(this.projectPath("package-yaml.yaml"));
        this.config.loadConfigFile(this.jsonPath, "package-yaml");
        this.config.loadConfigFile(this.yamlPath, "package-yaml");
        this.jsonExists = fs_1.default.existsSync(this.jsonPath);
        this.yamlExists = fs_1.default.existsSync(this.yamlPath);
    }
    get jsonName() {
        return "package.json";
    }
    get yamlName() {
        return `package.${this.yamlExtension || this.config.defaultExtension}`;
    }
    projectPath(localPath) {
        return path_1.default.join(this.projectDir, localPath);
    }
    get jsonPath() {
        return this.projectPath(this.jsonName);
    }
    get yamlPath() {
        return this.projectPath(this.yamlName);
    }
    get jsonContents() {
        if (this._jsonContents)
            return this._jsonContents;
        if (this.jsonExists) {
            try {
                return this._jsonContents = utils_1.loadAndParse(this.jsonPath, JSON.parse);
            }
            catch (e) {
                log_1.default.error("loadJson", "Cannot load or parse %s: %s", this.jsonPath, e);
                throw e;
            }
        }
        else {
            return this._jsonContents = {};
        }
    }
    set jsonContents(value) {
        if (deep_diff_1.diff(this._jsonContents, value)) {
            this.jsonModified = true;
        }
        this._jsonContents = value;
    }
    get yamlDocument() {
        if (this._yamlDocument)
            return this._yamlDocument;
        if (this.yamlExists) {
            try {
                return this._yamlDocument = utils_1.loadAndParse(this.yamlPath, yaml_1.default.parseDocument);
            }
            catch (e) {
                log_1.default.error("loadYaml", "Cannot load or parse %s: %s", this.yamlPath, e);
                throw e;
            }
        }
        else {
            return this._yamlDocument = new yaml_1.default.Document();
        }
    }
    set yamlDocument(value) {
        if (this._yamlDocument !== value) {
            this.yamlModified = true;
        }
        this._yamlDocument = value;
    }
    get yamlContents() {
        return this.yamlDocument.toJSON();
    }
    backupPath(filename) {
        const fullPath = this.projectPath(filename).replace(/\//g, '%');
        const backupPath = this.config.backupPath
            .replace("%s", filename)
            .replace("%S", fullPath);
        return path_1.default.resolve(this.projectDir, backupPath);
    }
    writeBackups() {
        let success = true;
        if (!this.config.writeBackups)
            return success;
        try {
            fs_1.default.writeFileSync(this.backupPath(this.jsonName), JSON.stringify(this.jsonContents, null, 4));
        }
        catch (e) {
            success = false;
            log_1.default.warn("writeBackups", "Error writing backup package.json file at %s: %s", this.backupPath(this.jsonName), e);
        }
        try {
            fs_1.default.writeFileSync(this.backupPath(this.yamlName), this.yamlDocument.toString());
        }
        catch (e) {
            success = false;
            log_1.default.warn("writeBackups", "Error writing backup %s file at %s: %s", this.yamlName, this.backupPath(this.yamlName), e);
        }
        return success;
    }
    writePackageFiles() {
        let success = true;
        if (this.yamlModified) {
            try {
                fs_1.default.writeFileSync(this.yamlPath, this.yamlDocument.toString());
                this.yamlModified = false;
            }
            catch (e) {
                success = false;
                log_1.default.error("writePackageFiles", "Error writing %s: %s", this.yamlPath, e);
            }
        }
        if (this.jsonModified) {
            try {
                fs_1.default.writeFileSync(this.jsonPath, JSON.stringify(this.jsonContents, null, 4));
                this.jsonModified = false;
            }
            catch (e) {
                success = false;
                log_1.default.error("writePackageFiles", "Error writing %s: %s", this.jsonPath, e);
            }
        }
        return success;
    }
    patchYaml(diff) {
        if (diff) {
            this.yamlDocument = utils_1.patchYamlDocument(this.yamlDocument, diff);
            this.yamlModified = true;
        }
        return this.yamlDocument;
    }
    patchJson(diff) {
        if (diff) {
            this.jsonContents = utils_1.patchObject(this.jsonContents, diff);
            this.jsonModified = true;
        }
        return this.jsonContents;
    }
    sync(conflictStrategy) {
        conflictStrategy = conflictStrategy || this.config.conflicts;
        if (!deep_diff_1.diff(this.jsonContents, this.yamlContents)) {
            log_1.default.verbose("sync", "Package files already in sync, writing backups");
            this.writeBackups();
            return true;
        }
        log_1.default.verbose("sync", "Package files out of sync. Trying to resolve...");
        if (!this.yamlExists) {
            log_1.default.verbose("sync", `${this.yamlName} does not exist, creating from package.json`);
            conflictStrategy = config_1.ConflictResolution.useJson;
        }
        else if (!this.jsonExists) {
            log_1.default.verbose("sync", `package.json does not exist, using ${this.yamlName}`);
            conflictStrategy = config_1.ConflictResolution.useYaml;
        }
        else if (this.config.writeBackups) {
            log_1.default.verbose("sync", "Attempting to read backups...");
            const jsonBackup = utils_1.loadAndParse(this.backupPath(this.jsonName), JSON.parse, true) || this.jsonContents;
            const yamlBackup = utils_1.loadAndParse(this.backupPath(this.yamlName), yaml_1.default.parse, true) || this.yamlContents;
            if (!deep_diff_1.diff(this.jsonContents, yamlBackup)) {
                log_1.default.verbose("sync", "package.yaml has changed, applying to package.json");
                conflictStrategy = config_1.ConflictResolution.useYaml;
            }
            else if (!deep_diff_1.diff(this.yamlContents, jsonBackup)) {
                log_1.default.verbose("sync", "package.json has changed, applying to package.yaml");
                conflictStrategy = config_1.ConflictResolution.useJson;
            }
            else if (!deep_diff_1.diff(jsonBackup, yamlBackup) && this.config.tryMerge) {
                log_1.default.verbose("sync", "Both json and yaml have changed, attempting merge");
                const jsonDiff = deep_diff_1.diff(jsonBackup, this.jsonContents);
                const yamlDiff = deep_diff_1.diff(yamlBackup, this.yamlContents);
                const patchedJson = yamlDiff ? utils_1.patchObject(JSON.parse(JSON.stringify(this.jsonContents)), yamlDiff) : this.jsonContents;
                const patchedYaml = jsonDiff ? utils_1.patchObject(this.yamlContents, jsonDiff) : this.yamlContents;
                if (!deep_diff_1.diff(patchedJson, patchedYaml)) {
                    log_1.default.verbose("sync", "Merge successful, continuing");
                    this.patchYaml(jsonDiff);
                    conflictStrategy = config_1.ConflictResolution.useYaml;
                }
                else {
                    log_1.default.verbose("sync", "Merge unsuccessful, reverting to default resolution (%s)", conflictStrategy);
                }
            }
            else {
                log_1.default.verbose("sync", "Backup(s) out of sync, reverting to default resolution (%s)", conflictStrategy);
            }
        }
        if (conflictStrategy == config_1.ConflictResolution.useLatest) {
            // We know that both yaml and json must exist, otherwise we wouldn't still be
            // set to useLatest
            log_1.default.verbose("sync", "Checking timestamps...");
            const jsonTime = fs_1.default.statSync(this.jsonPath).mtimeMs / 1000.0;
            const yamlTime = fs_1.default.statSync(this.yamlPath).mtimeMs / 1000.0;
            if (Math.abs(yamlTime - jsonTime) <= this.config.timestampFuzz) {
                log_1.default.verbose("sync", "Timestamp difference %ss <= fuzz factor %ss, reverting to ask", Math.abs(jsonTime - yamlTime), this.config.timestampFuzz);
                conflictStrategy = config_1.ConflictResolution.ask;
            }
            else if (yamlTime > jsonTime) {
                log_1.default.verbose("sync", "%s %ss newer than package.json, overwriting", this.yamlName, yamlTime - jsonTime);
                conflictStrategy = config_1.ConflictResolution.useYaml;
            }
            else {
                log_1.default.verbose("sync", "package.json %ss newer than %s, overwriting", jsonTime - yamlTime, this.yamlName);
                conflictStrategy = config_1.ConflictResolution.useJson;
            }
        }
        if (conflictStrategy == config_1.ConflictResolution.ask) {
            log_1.default.verbose("sync", "Cannot sync, returning ask");
            return config_1.ConflictResolution.ask;
        }
        if (conflictStrategy == config_1.ConflictResolution.useJson) {
            log_1.default.verbose("sync", "Patching %s with changes from package.json", this.yamlName);
            this.patchYaml(deep_diff_1.diff(this.yamlContents, this.jsonContents));
        }
        else if (conflictStrategy == config_1.ConflictResolution.useYaml) {
            log_1.default.verbose("sync", "Patching package.json with changes from %s", this.yamlName);
            this.patchJson(deep_diff_1.diff(this.jsonContents, this.yamlContents));
        }
        this.writeBackups();
        return this.writePackageFiles();
    }
}
exports.default = Project;
