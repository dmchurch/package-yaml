"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const log_1 = __importDefault(require("./log"));
require("reflect-metadata");
const osenv_1 = __importDefault(require("osenv"));
const path_1 = __importDefault(require("path"));
const yaml_1 = __importDefault(require("yaml"));
const fs_1 = __importDefault(require("fs"));
const propertyClassesKey = Symbol("propertyClasses");
function property(target, propertyKey) {
    const propClasses = Reflect.getOwnMetadata(propertyClassesKey, target.constructor) || {};
    const propClass = Reflect.getMetadata('design:type', target, propertyKey);
    propClasses[propertyKey] = propClass;
    Reflect.defineMetadata(propertyClassesKey, propClasses, target.constructor);
}
function getPropClasses(target) {
    const classTarget = typeof target === "object" ? target.constructor : target;
    const classProperties = Reflect.getOwnMetadata(propertyClassesKey, classTarget) || {};
    return classProperties;
}
function getProps(target) {
    return Object.keys(getPropClasses(target));
}
function getPropClass(target, prop) {
    return getPropClasses(target)[prop];
}
function isPropClass(target, prop, cls) {
    const propClass = getPropClass(target, prop);
    return (propClass === cls);
}
var ConflictResolution;
(function (ConflictResolution) {
    ConflictResolution["ask"] = "ask";
    ConflictResolution["useJson"] = "use-json";
    ConflictResolution["useYaml"] = "use-yaml";
    ConflictResolution["useLatest"] = "use-latest";
})(ConflictResolution = exports.ConflictResolution || (exports.ConflictResolution = {}));
;
class Config {
    constructor(loadConfigFiles = true) {
        this.debug = false;
        this.writeBackups = true;
        this.backupPath = ".%s~"; // %s - basename; %S - full path with % interpolations
        this.timestampFuzz = 5;
        this.conflicts = ConflictResolution.ask;
        this.tryMerge = true; // Only functions when backups are being written
        this.preserveOrder = true;
        this.defaultExtension = "yaml";
        this._lockedProps = {};
        if (!!process.env.DEBUG_PACKAGE_YAML) {
            this.updateAndLock({ debug: true });
        }
        else {
            this.update({ debug: false });
        }
        if (process.env.PACKAGE_YAML_FORCE) {
            const confl = `use-${process.env.PACKAGE_YAML_FORCE}`;
            if (Config.isValid("conflicts", confl)) {
                this.updateAndLock({ conflicts: confl });
            }
        }
        if (loadConfigFiles) {
            this.loadSystemConfig();
        }
    }
    loadSystemConfig() {
        for (let globalPath of ['/etc', '/usr/local/etc']) {
            // FIXME: this won't work on Windows
            this.loadConfigFile(path_1.default.join(globalPath, "package-yaml.json"));
            this.loadConfigFile(path_1.default.join(globalPath, "package-yaml.yaml"));
        }
        const home = osenv_1.default.home();
        this.loadConfigFile(path_1.default.join(home, ".package-yaml.json"));
        this.loadConfigFile(path_1.default.join(home, ".package-yaml.yaml"));
    }
    static isValid(prop, value) {
        log_1.default.verbose("Config.isValid", "checking %s: %s", prop, value);
        if (prop === "conflicts") {
            log_1.default.verbose("Config.isValid", "ovcfr: %o; includes: %s", Object.values(ConflictResolution), Object.values(ConflictResolution).includes(value));
            return typeof value === 'string' && (Object.values(ConflictResolution).includes(value));
        }
        else if (prop === "defaultExtension") {
            return value === 'yaml' || value === 'yml';
        }
        else if (isPropClass(Config, prop, String)) {
            return typeof value === 'string';
        }
        else if (isPropClass(Config, prop, Boolean)) {
            return true; // anything can be a Boolean if you just believe
        }
        else if (isPropClass(Config, prop, Number)) {
            return !isNaN(Number(value));
        }
        return false;
    }
    validate(values) {
        const valid = {};
        const propNames = getProps(Config);
        for (const prop of propNames) {
            const val = values[prop];
            if (this._lockedProps[prop] || !(prop in values) || !Config.isValid(prop, val)) {
                continue;
            }
            if (isPropClass(Config, prop, String)) {
                valid[prop] = String(values[prop]); // We've already validated these
            }
            else if (isPropClass(Config, prop, Boolean)) {
                valid[prop] = !!values[prop];
            }
            else if (isPropClass(Config, prop, Number)) {
                valid[prop] = Number(values[prop]);
            }
        }
        return valid;
    }
    update(values) {
        const valid = this.validate(values);
        Object.assign(this, valid);
        if ('debug' in valid) {
            log_1.default.level = valid.debug ? 'verbose' : 'info';
        }
        return valid;
    }
    lock(props) {
        for (let prop of props) {
            if (prop in this) {
                this._lockedProps[prop] = true;
            }
        }
    }
    updateAndLock(values) {
        const updated = this.update(values);
        this.lock(Object.keys(updated));
        return updated;
    }
    loadConfigFile(path, rootElement) {
        let configData;
        let configParsed;
        try {
            if (!fs_1.default.existsSync(path)) {
                return null;
            }
            configData = fs_1.default.readFileSync(path, { encoding: "utf8" });
        }
        catch (e) {
            log_1.default.error("loadConfig", "Error loading config file %s: %s", path, e);
            return null;
        }
        try {
            // YAML parsing *should* work for JSON files without issue
            configParsed = yaml_1.default.parse(configData);
        }
        catch (yamlError) {
            // try using JSON as a backup
            try {
                configParsed = JSON.parse(configData);
            }
            catch (jsonError) {
                const error = path.endsWith(".json") ? jsonError : yamlError;
                log_1.default.error("loadConfig", "Error parsing YAML/JSON config file %s: %s", path, error);
                return null;
            }
        }
        if (rootElement) {
            if (!configParsed || typeof configParsed !== "object" || !configParsed[rootElement]) {
                // Acceptable, just like if the file didn't exist
                return null;
            }
            configParsed = configParsed[rootElement];
        }
        if (!configParsed || typeof configParsed !== "object") {
            if (rootElement) {
                log_1.default.error("loadConfig", "Invalid configuration stanza %s in %s (should be an object)", rootElement, path);
            }
            else {
                log_1.default.error("loadConfig", "Invalid configuration file %s (should be a JSON/YAML object)", path);
            }
            return null;
        }
        return this.update(configParsed);
    }
}
__decorate([
    property,
    __metadata("design:type", Boolean)
], Config.prototype, "debug", void 0);
__decorate([
    property,
    __metadata("design:type", Boolean)
], Config.prototype, "writeBackups", void 0);
__decorate([
    property,
    __metadata("design:type", String)
], Config.prototype, "backupPath", void 0);
__decorate([
    property,
    __metadata("design:type", Number)
], Config.prototype, "timestampFuzz", void 0);
__decorate([
    property,
    __metadata("design:type", String)
], Config.prototype, "conflicts", void 0);
__decorate([
    property,
    __metadata("design:type", Boolean)
], Config.prototype, "tryMerge", void 0);
__decorate([
    property,
    __metadata("design:type", Boolean)
], Config.prototype, "preserveOrder", void 0);
__decorate([
    property,
    __metadata("design:type", String)
], Config.prototype, "defaultExtension", void 0);
exports.Config = Config;
;
