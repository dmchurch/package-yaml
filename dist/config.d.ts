import 'reflect-metadata';
declare type PickTypedPropNames<T, U> = NonNullable<{
    [k in keyof T]: T[k] extends U ? k : never;
}[keyof T]>;
declare type PickTypedProps<T, U> = Pick<T, PickTypedPropNames<T, U>>;
declare type SimplePropNames<T> = PickTypedPropNames<T, string | boolean | number>;
declare type SimpleProps<T> = PickTypedProps<T, string | boolean | number>;
export declare enum ConflictResolution {
    ask = "ask",
    useJson = "use-json",
    useYaml = "use-yaml",
    useLatest = "use-latest"
}
export declare class Config {
    readonly debug: boolean;
    readonly writeBackups: boolean;
    readonly backupPath: string;
    readonly timestampFuzz: number;
    readonly conflicts: ConflictResolution;
    readonly tryMerge: boolean;
    readonly defaultExtension: "yaml" | "yml";
    _lockedProps: {
        -readonly [k in keyof Config]?: boolean;
    };
    constructor(loadConfigFiles?: boolean);
    loadSystemConfig(): void;
    static isValid<P extends keyof Config>(prop: P, value: any): value is Config[P];
    validate(values: any): Partial<SimpleProps<Config>>;
    update(values: Partial<SimpleProps<Config>>): Partial<SimpleProps<Config>>;
    lock(props: SimplePropNames<Config>[]): void;
    updateAndLock(values: Partial<SimpleProps<Config>>): Partial<SimpleProps<Config>>;
    loadConfigFile(path: string, rootElement?: string): Partial<SimpleProps<Config>> | null;
}
export {};
