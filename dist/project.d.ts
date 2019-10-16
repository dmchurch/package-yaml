import { Diff } from 'deep-diff';
import yaml from 'yaml';
import { Config, ConflictResolution } from './config';
export default class Project {
    readonly projectDir: string;
    yamlExtension: string | null;
    readonly config: Config;
    readonly jsonName: string;
    readonly yamlName: string;
    projectPath(localPath: string): string;
    readonly jsonPath: string;
    readonly yamlPath: string;
    readonly jsonExists: boolean;
    readonly yamlExists: boolean;
    yamlModified: boolean;
    jsonModified: boolean;
    private _jsonContents?;
    private _yamlDocument?;
    jsonContents: object;
    yamlDocument: yaml.ast.Document;
    readonly yamlContents: object;
    backupPath(filename: string): string;
    constructor(projectDir: string);
    writeBackups(): boolean;
    writePackageFiles(): boolean;
    patchYaml(diff: Diff<any, any>[] | null | undefined): yaml.ast.Document;
    patchJson(diff: Diff<any, any>[] | null | undefined): any;
    sync(conflictStrategy?: ConflictResolution): boolean | ConflictResolution.ask;
}
