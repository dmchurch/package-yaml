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

const copyPatchType = Symbol('copyPatchType');
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
    object: Record<string|symbol, CopyPatch>;
}
interface CopyPatchArraySpec {
    [copyPatchType]: 'array';
    array: CopyPatch[];
}
type CopyPatchSpec = CopyPatchDescriptorSpec | CopyPatchValueSpec | CopyPatchObjectSpec | CopyPatchArraySpec;
type CopyPatchSpecTypes = CopyPatchSpec[typeof copyPatchType];
type CopyPatchSpecFromType<T, U=CopyPatchSpec> = U extends {[copyPatchType]: T} ? U : never;

function makePatchSpec<T extends CopyPatchSpecTypes>(type: T, arg: any): CopyPatchSpecFromType<T> {
    return {
        [copyPatchType]: type,
        [type]: arg,
    } as CopyPatchSpecFromType<T>;
}
function isPatchSpec<T extends CopyPatchSpecTypes>(spec: CopyPatchSpec | undefined, type: T): spec is CopyPatchSpecFromType<T> {
    if (!spec) return false;
    return spec[copyPatchType] === type
}

export type CopyPatch = CopyPatchSpec | boolean | string | number | object | null | any[];

deepCopy.descriptor = (d:PropertyDescriptor) => makePatchSpec('descriptor', d);
deepCopy.value = (v:any) => makePatchSpec('value', v);
deepCopy.object = (o:Record<string,any>) => makePatchSpec('object', o);
deepCopy.array = (a:any[]) => makePatchSpec('array', a);

function inferPatchSpec(p: CopyPatch | undefined): CopyPatchSpec | undefined {
    if (typeof p === 'undefined') {
        return undefined;
    } else if (!p) {
        return deepCopy.value(p);
    } else if (typeof p === 'object' && copyPatchType in p) {
        return p as CopyPatchSpec;
    } else if (Array.isArray(p)) {
        return deepCopy.array(p);
    } else if (typeof p === 'object') {
        return deepCopy.object(p);
    } else {
        return deepCopy.value(p);
    }
}

function _deepCopy<T>(circReg: Map<any, any>, obj: T, patches?:CopyPatch): T {
    const patchSpec = inferPatchSpec(patches);
    if (isPatchSpec(patchSpec, 'value')) {
        return patchSpec.value;
    }
    if (isPatchSpec(patchSpec, 'descriptor')) {
        throw new TypeError("Not expecting a descriptor spec here");
    }
    if (!obj && isPatchSpec(patchSpec, 'array')) {
        (obj as any) = [];
        Object.setPrototypeOf(obj, Object.getPrototypeOf(patchSpec.array));
    } else if (!obj && isPatchSpec(patchSpec, 'object')) {
        (obj as any) = {};
        Object.setPrototypeOf(obj, Object.getPrototypeOf(patchSpec.object));
    }
    if (!obj || typeof obj !== 'object') {
        return obj;
    }
    if (circReg.has(obj)) {
        return circReg.get(obj);
    }
    const descriptors = Object.getOwnPropertyDescriptors(obj) as any;
    if (isPatchSpec(patchSpec, 'array') && !Array.isArray(obj)) {
        throw new TypeError("Patch spec array received for object");
    }
    const recurse:any = {};
    if (patchSpec) {
        const subSpecs:any = isPatchSpec(patchSpec,'array') ? patchSpec.array : patchSpec.object;
        for (const prop of (Object.getOwnPropertyNames(subSpecs) as (string|symbol)[]).concat(Object.getOwnPropertySymbols(subSpecs))) {
            const subSpec = inferPatchSpec(subSpecs[prop]);
            if (isPatchSpec(patchSpec,'array') && prop === 'length') continue; // don't patch length unless specifically requested
            if (!subSpec) continue;
            if (isPatchSpec(subSpec, 'value')) {
                descriptors[prop] = {
                    ...(descriptors[prop] || {
                        enumerable: true,
                        configurable: true,
                        writable: true,
                    }),
                    value: subSpec.value,
                };
            } else if (isPatchSpec(subSpec, 'descriptor')) {
                descriptors[prop] = {
                    ...descriptors[prop],
                    ...subSpec.descriptor,
                };
            } else {
                recurse[prop] = subSpec;
                if (!(prop in descriptors)) {
                    descriptors[prop] = {
                        enumerable: true,
                        configurable: true,
                        writable: true,
                        value: null,
                    };
                }
            }
        }
    }
    const newObj = Array.isArray(obj) ? [] : {};
    circReg.set(obj, newObj);
    for (const prop of (Object.getOwnPropertyNames(descriptors) as (string|symbol)[]).concat(Object.getOwnPropertySymbols(descriptors))) {
        const descriptor = descriptors[prop];
        if (Array.isArray(obj) && prop === 'length') {
            // Normally we do nothing at all with an array's length, UNLESS it was specifically mentioned. And even then, we just set the length.
            if (isPatchSpec(patchSpec, 'object') && 'length' in patchSpec.object) {
                // this has already been parsed by the above, so:
                (newObj as any[]).length = descriptor.value;
            }
        }
        if ('value' in descriptor) {
            descriptor.value = _deepCopy(circReg, descriptor.value, recurse[prop]);
        }
        Object.defineProperty(newObj, prop, descriptor);
    }

    if (Object.getPrototypeOf(obj) !== Object.getPrototypeOf(newObj)) {
        Object.setPrototypeOf(newObj, Object.getPrototypeOf(obj));
    }

    return newObj as T;
}

export function deepCopy<T>(obj: T, patches?:CopyPatch) {return _deepCopy(new Map(), obj, patches);}

export const orderSymbol = Symbol("keyOrder");

export function recordKeyOrder<T>(obj: T, recursive: boolean=false, key:string|symbol|boolean = false, descriptor?: Partial<PropertyDescriptor>): T {
    const orderKey = typeof key === 'boolean' ? orderSymbol : key;
    const descriptorOpts:PropertyDescriptor = {
        writable: true,
        enumerable: !!key,
        configurable: true,
        ...(descriptor || {}),
    }
    if (typeof obj == 'object' && obj && ! Array.isArray(obj)) {
        Object.defineProperty(obj, orderKey, {...descriptorOpts, value: Object.getOwnPropertyNames(obj).filter(p=>p!==orderKey)});
    }
    if (recursive && obj && typeof obj === 'object') {
        for (const prop in obj) {
            recordKeyOrder((obj as any)[prop], recursive, key, descriptor);
        }
    }
    return obj;
}

export function restoreKeyOrder<T>(obj: T, recursive: boolean=false, key:string|symbol|false = false): T {
    const orderKey = key || orderSymbol;
    if (typeof obj === 'object' && obj && orderKey in obj) {
        const order = (obj as any)[orderKey];
        delete (obj as any)[orderKey];
        reorderKeys(obj, order);
    }
    if (recursive && obj && typeof obj == 'object') {
        for (const prop in obj) {
            restoreKeyOrder((obj as any)[prop], recursive, key);
        }
    }
    return obj;
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

export function patchObject<T,U>(jsonContents: T, packageDiff: undefined): T
export function patchObject<T,U>(jsonContents: T, packageDiff: Diff<T,U>[]): U
export function patchObject<T,U>(jsonContents: T, packageDiff: Diff<T,U>[]|undefined): U|T {
    if (!packageDiff) {
        return jsonContents;
    }
    for (let diffEntry of packageDiff) {
        applyChange(jsonContents,null,diffEntry);
    }
    return jsonContents as unknown as U;
}

type AstNode = yaml.ast.AstNode;
type AstNodeType = AstNode['type'];

type NodeFromType<T extends AstNodeType | undefined | null, N extends AstNode | undefined | null = AstNode | undefined | null>
    = N extends {type: T} ? N
    : never;
type TypeFromNode<N extends AstNode | undefined | null> = N extends AstNode ? N['type'] : undefined;

function astNodeIs<N extends AstNode | undefined | null, T extends TypeFromNode<N>>(value: N, ...list:T[]): value is NodeFromType<T, N> {
    if (!value) {
        return false;
    }
    return list.includes(value.type as T);
}

function getMapEntries(map: yaml.ast.MapNode) {
    return map.items.map((p) => {
        if (p.type === 'PAIR') {
            if (typeof p.key === 'string') {
                return [p.key, p];
            } else if (astNodeIs(p.key, 'PLAIN', 'QUOTE_DOUBLE', 'QUOTE_SINGLE') && (typeof p.key.value === "string" || typeof p.key.value === "number")) {
                return [p.key.value.toString(), p];
            }
        }
        throw new TypeError(`Cannot handle map pair ${p}`);
    }) as [string, yaml.ast.MapNode["items"][number]][];
}

function getMapOrder(map:yaml.ast.MapNode) {
    return getMapEntries(map).map(([key, _]) => key);
}

function setMapOrder(map:yaml.ast.MapNode, mapOrder: string[]):void {
    const mapItems:Record<string, yaml.ast.MapNode["items"][number]> = {};
    for (const [key, value] of getMapEntries(map)) {
        mapItems[key] = value;
    }
    map.items = mapOrder.map(key=>mapItems[key]);
}

export function patchYamlDocument(yamlDoc: yaml.ast.Document, packageDiff: Diff<any,any>[]|undefined, orderKey?:string|symbol|boolean):yaml.ast.Document {
    if (!packageDiff) {
        return yamlDoc;
    }
    if (orderKey === true) {
        orderKey = orderSymbol;
    }
    const reorders:Record<string, string[]> = {};
    for (const diffEntry of packageDiff) {
        if (orderKey && diffEntry.path && diffEntry.path.includes(orderKey)) {
            const itemPath = diffEntry.path.slice(0, diffEntry.path.indexOf(orderKey));
            const subPath = diffEntry.path.slice(diffEntry.path.indexOf(orderKey)+1);
            const pathJson = JSON.stringify(itemPath);
            if (!(pathJson in reorders)) {
                const map = yamlDoc.getIn(itemPath);
                if (!astNodeIs(map, 'FLOW_MAP', 'MAP')) {
                    throw new Error(`Got an order entry in something not a Map: ${diffEntry.path}`);
                }
                reorders[pathJson] = getMapOrder(map);
            }
            const newDiff = deepCopy(diffEntry, {path: deepCopy.value(subPath.length == 0 ? undefined : subPath)});
            applyChange(reorders[pathJson], null, newDiff);
            continue;
        }
        const editPath = (diffEntry.path||[]).concat(diffEntry.kind == 'A' ? diffEntry.index: []);
        const editItem = (diffEntry.kind == 'A') ? diffEntry.item : diffEntry;
        if (editItem.kind == 'E' || editItem.kind == 'N') {
            const origNode = yamlDoc.getIn(editPath, true);
            const newNode = typeof editItem.rhs == 'undefined' ? undefined : yaml.createNode(editItem.rhs)
            if (origNode && newNode) {
                newNode.comment = origNode.comment;
                newNode.commentBefore = origNode.commentBefore;
            }
            yamlDoc.setIn(editPath, newNode);
        } else if (editItem.kind == 'D') {
            yamlDoc.deleteIn(editPath);
        }
    }

    for (const [pathJson, mapOrder] of Object.entries(reorders)) {
        const path = JSON.parse(pathJson) as any[];
        const map = yamlDoc.getIn(path);
        if (!astNodeIs(map, 'FLOW_MAP', 'MAP')) {
            throw new Error(`Unexpected non-map found in path ${pathJson}`);
        }
        setMapOrder(map, mapOrder);
    }
    
    return yamlDoc;
}
