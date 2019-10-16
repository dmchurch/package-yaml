import yaml from 'yaml';
import { Diff } from 'deep-diff';
export declare function reorderKeys<T>(obj: T, keyOrder: (keyof T)[]): T;
export declare function copyReorderKeys<T>(obj: T, keyOrder: (keyof T)[]): {
    [P in keyof T]: T[P];
};
export declare function sortKeys<T>(obj: T): T;
export declare function loadAndParse<T>(path: string, parser: (data: string) => T, inhibitErrors?: false): T;
export declare function loadAndParse<T>(path: string, parser: (data: string) => T, inhibitErrors?: true): T | null;
export declare function patchObject(jsonContents: any, packageDiff: Diff<any, any>[]): any;
export declare function patchYamlDocument(yamlDoc: yaml.ast.Document, packageDiff: Diff<any, any>[]): yaml.ast.Document;
