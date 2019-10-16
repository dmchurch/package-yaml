import yaml from 'yaml';
import fs from 'fs';
import { Diff, applyChange } from 'deep-diff';

export function reorderKeys<T>(obj: T, keyOrder: (keyof T)[]): T {
    const propNames:(keyof T)[] = Object.getOwnPropertyNames(obj) as (keyof T)[];
    const objSave = {...obj};

    if (propNames.length != keyOrder.length) {
        throw new TypeError(`keyOrder.length ${keyOrder.length} != ownProperties.length ${propNames.length}, not reordering`);
    }

    for (const prop of keyOrder) {
        if (!propNames.includes(prop)) {
            throw new TypeError(`keyOrder property ${prop} not in ownProperties`);
        }
        delete obj[prop];
        obj[prop] = objSave[prop];
    }

    return obj;
}

export function copyReorderKeys<T>(obj: T, keyOrder: (keyof T)[]): {[P in keyof T]: T[P]} {
    const copy = {...obj};
    return reorderKeys(copy, keyOrder);
}

export function sortKeys<T>(obj: T): T {
    const keyOrder = Object.getOwnPropertyNames(obj).sort() as (keyof T)[];
    return reorderKeys(obj, keyOrder);
}

export function loadAndParse<T>(path:string, parser:(data:string)=>T, inhibitErrors?:false): T;
export function loadAndParse<T>(path:string, parser:(data:string)=>T, inhibitErrors?:true): T | null;
export function loadAndParse<T>(path:string, parser:(data:string)=>T, inhibitErrors=false): T | null {
    try {
        const data = fs.readFileSync(path, {encoding:"utf8"});
        return parser(data);
    } catch (e) {
        if (inhibitErrors) {
            return null;
        }
        throw e;
    }
}

export function patchObject(jsonContents: any, packageDiff: Diff<any,any>[]): any {
    for (let diffEntry of packageDiff) {
        applyChange(jsonContents,null,diffEntry);
    }
    return jsonContents;
}

export function patchYamlDocument(yamlDoc: yaml.ast.Document, packageDiff: Diff<any,any>[]):yaml.ast.Document {
    for (const diffEntry of packageDiff) {
        const editPath = (diffEntry.path||[]).concat(diffEntry.kind == 'A' ? diffEntry.index: []);
        const editItem = (diffEntry.kind == 'A') ? diffEntry.item : diffEntry;
        if (editItem.kind == 'E' || editItem.kind == 'N') {
            yamlDoc.setIn(editPath, typeof editItem.rhs == 'undefined' ? undefined : yaml.createNode(editItem.rhs));
        } else if (editItem.kind == 'D') {
            yamlDoc.deleteIn(editPath);
        }
    }
    return yamlDoc;
}

