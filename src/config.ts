import log from './log';
import 'reflect-metadata';
import osenv from 'osenv';
import path from 'path';
import yaml from 'yaml';
import fs from 'fs';

type Constructor<T> =
    T extends (undefined|null) ? never :
    T extends string ? StringConstructor :
    T extends number ? NumberConstructor :
    T extends boolean ? BooleanConstructor :
    T extends Function ? FunctionConstructor :
    T extends symbol ? SymbolConstructor :
    T extends bigint ? BigIntConstructor :
    new(...args:any[]) => T;
type Instance<T> =
    T extends SymbolConstructor ? Symbol :
    T extends BigIntConstructor ? BigInt :
    T extends new(...args:any)=>any ? InstanceType<T> :
    never;

type PickTypedPropNames<T, U> = NonNullable<{[k in keyof T]: T[k] extends U ? k : never}[keyof T]>;
type PickTypedProps<T, U> = Pick<T, PickTypedPropNames<T, U>>;
type SimplePropNames<T> = PickTypedPropNames<T, string|boolean|number>;
type SimpleProps<T> = PickTypedProps<T, string|boolean|number>;

const propertyClassesKey = Symbol("propertyClasses");

function property(target: object, propertyKey: string) {
    const propClasses: {[p:string]:Constructor<any>} = Reflect.getOwnMetadata(propertyClassesKey, target.constructor) || {};
    const propClass:Constructor<any> = Reflect.getMetadata('design:type', target, propertyKey);
    propClasses[propertyKey] = propClass;
    Reflect.defineMetadata(propertyClassesKey, propClasses, target.constructor);
}

function getPropClasses<T extends object>(target:Constructor<T> | T): {[k in keyof T]: Constructor<T[k]>} {
    const classTarget:Constructor<T> = typeof target === "object" ? target.constructor as Constructor<T> : target
    const classProperties = Reflect.getOwnMetadata(propertyClassesKey, classTarget) || {};
    return classProperties;
}

function getProps<T extends object, P extends keyof T>(target:Constructor<T> | T): P[] {
    return Object.keys(getPropClasses(target)) as P[];
}

function getPropClass<T extends object, P extends keyof T>(target:Constructor<T> | T, prop:P): Constructor<T[P]> {
    return getPropClasses(target)[prop];
}

function isPropClass<T extends object, U extends Constructor<any>>(target: Constructor<T>, prop: keyof T, cls: U): prop is PickTypedPropNames<T, Instance<U>> {
    const propClass:Constructor<any> = getPropClass(target, prop);
    return (propClass === cls);
}

export enum ConflictResolution {
    ask = "ask",
    useJson = "use-json",
    useYaml = "use-yaml",
    useLatest = "use-latest",
};

type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
}
export class Config {
    @property readonly debug: boolean = false;
    @property readonly writeBackups: boolean = true;
    @property readonly backupPath: string = ".%s~"; // %s - basename; %S - full path with % interpolations
    @property readonly timestampFuzz: number = 5;
    @property readonly conflicts: ConflictResolution = ConflictResolution.ask;
    @property readonly tryMerge: boolean = true; // Only functions when backups are being written

    @property readonly defaultExtension: "yaml" | "yml" = "yaml";

    _lockedProps: {-readonly [k in keyof Config]?: boolean} = {};

    constructor(loadConfigFiles:boolean = true) {
        if (!!process.env.DEBUG_PACKAGE_YAML) {
            this.updateAndLock({debug:true})
        }
        if (process.env.PACKAGE_YAML_FORCE) {
            const confl = `use-${process.env.PACKAGE_YAML_FORCE}`;
            if (Config.isValid("conflicts",confl)) {
                this.updateAndLock({conflicts: confl});
            }
        }
        if (loadConfigFiles) {
            this.loadSystemConfig();
        }
    }

    loadSystemConfig():void {
        for (let globalPath of ['/etc','/usr/local/etc']) {
            // FIXME: this won't work on Windows
            this.loadConfigFile(path.join(globalPath, "package-yaml.json"));
            this.loadConfigFile(path.join(globalPath, "package-yaml.yaml"));
        }
        const home = osenv.home();
        this.loadConfigFile(path.join(home, ".package-yaml.json"));
        this.loadConfigFile(path.join(home, ".package-yaml.yaml"));
    }

    static isValid<P extends keyof Config>(prop:P, value:any): value is Config[P] {
        log.verbose("Config.isValid","checking %s: %s", prop, value);
        if (prop === "conflicts") {
            log.verbose("Config.isValid","ovcfr: %o; includes: %s",Object.values(ConflictResolution),Object.values(ConflictResolution).includes(value as ConflictResolution));
            return typeof value === 'string' && (Object.values(ConflictResolution).includes(value as ConflictResolution));
        } else if (prop === "defaultExtension") {
            return value === 'yaml' || value === 'yml';
        } else if (isPropClass(Config, prop, String)) {
            return typeof value === 'string';
        } else if (isPropClass(Config, prop, Boolean)) {
            return true; // anything can be a Boolean if you just believe
        } else if (isPropClass(Config, prop, Number)) {
            return !isNaN(Number(value));
        }
        return false;
    }

    validate(values: any): Partial<SimpleProps<Config>> {
        const valid:Mutable<Partial<SimpleProps<Config>>> = {};
        const propNames = getProps(Config);

        for (const prop of propNames) {
            const val:any = values[prop];
            if (this._lockedProps[prop] || !(prop in values) || !Config.isValid(prop, val)) {
                continue;
            }
            if (isPropClass(Config, prop, String)) {
                valid[prop] = String(values[prop]) as any; // We've already validated these
            } else if (isPropClass(Config, prop, Boolean)) {
                valid[prop] = !!values[prop];
            } else if (isPropClass(Config, prop, Number)) {
                valid[prop] = Number(values[prop]);
            }
        }
        return valid;
    }
    update(values: Partial<SimpleProps<Config>>):Partial<SimpleProps<Config>> {
        const valid = this.validate(values);
        Object.assign(this, valid);
        if ('debug' in valid) {
            log.level = valid.debug ? 'verbose' : 'info';
        }
        return valid;
    }

    lock(props: SimplePropNames<Config>[]):void {
        for (let prop of props) {
            if (prop in this) {
                this._lockedProps[prop as SimplePropNames<Config>] = true;
            }
        }
    }

    updateAndLock(values: Partial<SimpleProps<Config>>):Partial<SimpleProps<Config>> {
        const updated = this.update(values);
        this.lock(Object.keys(updated) as SimplePropNames<Config>[]);
        return updated;
    }

    loadConfigFile(path:string, rootElement?:string):Partial<SimpleProps<Config>>|null {
        let configData:string;
        let configParsed;
        try {
            if (!fs.existsSync(path)) {
                return null;
            }
            configData = fs.readFileSync(path, {encoding: "utf8"});
        } catch (e) {
            log.error("loadConfig", "Error loading config file %s: %s", path, e);
            return null;
        }
        try {
            // YAML parsing *should* work for JSON files without issue
            configParsed = yaml.parse(configData);
        } catch (yamlError) {
            // try using JSON as a backup
            try {
                configParsed = JSON.parse(configData)
            } catch (jsonError) {
                const error = path.endsWith(".json") ? jsonError : yamlError;
                log.error("loadConfig", "Error parsing YAML/JSON config file %s: %s", path, error);
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
                log.error("loadConfig", "Invalid configuration stanza %s in %s (should be an object)", rootElement, path);
            } else {
                log.error("loadConfig", "Invalid configuration file %s (should be a JSON/YAML object)", path);
            }
            return null;
        }
        return this.update(configParsed);
    }
};
