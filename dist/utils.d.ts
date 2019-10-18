import yaml from 'yaml';
import { Diff } from 'deep-diff';
export declare function reorderKeys<T>(obj: T, keyOrder: (keyof T)[]): T;
export declare function copyReorderKeys<T>(obj: T, keyOrder: (keyof T)[]): {
    [P in keyof T]: T[P];
};
export declare function sortKeys<T>(obj: T): T;
declare const copyPatchType: unique symbol;
interface CopyPatchDescriptorSpec {
    [copyPatchType]: 'descriptor';
    descriptor: PropertyDescriptor;
}
interface CopyPatchValueSpec {
    [copyPatchType]: 'value';
    value: any;
}
interface CopyPatchObjectSpec {
    [copyPatchType]: 'object';
    object: Record<string | symbol, CopyPatch>;
}
interface CopyPatchArraySpec {
    [copyPatchType]: 'array';
    array: CopyPatch[];
}
declare type CopyPatchSpec = CopyPatchDescriptorSpec | CopyPatchValueSpec | CopyPatchObjectSpec | CopyPatchArraySpec;
export declare type CopyPatch = CopyPatchSpec | boolean | string | number | object | null | any[];
export declare function deepCopy<T>(obj: T, patches?: CopyPatch): T;
export declare namespace deepCopy {
    var descriptor: (d: PropertyDescriptor) => CopyPatchDescriptorSpec;
    var value: (v: any) => CopyPatchValueSpec;
    var object: (o: Record<string, any>) => CopyPatchObjectSpec;
    var array: (a: any[]) => CopyPatchArraySpec;
}
export declare const orderSymbol: unique symbol;
export declare function recordKeyOrder<T>(obj: T, recursive?: boolean, key?: string | symbol | boolean, descriptor?: Partial<PropertyDescriptor>): T;
export declare function restoreKeyOrder<T>(obj: T, recursive?: boolean, key?: string | symbol | false): T;
export declare function loadAndParse<T>(path: string, parser: (data: string) => T, inhibitErrors?: false): T;
export declare function loadAndParse<T>(path: string, parser: (data: string) => T, inhibitErrors?: true): T | null;
export declare function patchObject<T, U>(jsonContents: T, packageDiff: undefined): T;
export declare function patchObject<T, U>(jsonContents: T, packageDiff: Diff<T, U>[]): U;
export declare function patchYamlDocument(yamlDoc: yaml.ast.Document, packageDiff: Diff<any, any>[] | undefined, orderKey?: string | symbol | boolean): yaml.ast.Document;
export {};
