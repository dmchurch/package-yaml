import { Config, ConflictResolution } from "./config";
import mockFs from 'mock-fs';
import Project from './project';

jest.mock('./log');
const mockLog = require('./log') as typeof import('./__mocks__/log');

const mockDirs = {
    config_explicit: {
        "package-yaml.json": '{"timestampFuzz":35}',
        "package-yaml.yaml": 'backupPath: TEST_EXPLICIT',
    },
    config_package: {
        "package.json": '{"package-yaml":{"timestampFuzz":40}}',
        "package.yaml": 'package-yaml:\n  backupPath: TEST_PACKAGE',
    },
};

const envSave:any={};
beforeEach(()=>{
    Object.assign(envSave, process.env);
    for (const prop in process.env) {
        delete process.env[prop];
    }
});
afterEach(()=>{
    mockFs.restore();
    for (const prop in process.env) {
        delete process.env[prop];
    }
    Object.assign(process.env, envSave);
    expect(mockLog.error).not.toHaveBeenCalled();
});

describe('new Project()', () => {
    it('defaults to configured yaml extension', () => {
        mockFs({});
        const project = new Project('.');
        expect(project.yamlExtension).toBeNull();
        (project.config.defaultExtension as any) = 'TEST';
        expect(project.yamlName).toEqual("package.TEST");
    });

    it('uses package.yaml if detected', () => {
        mockFs({
            "package.yaml": "",
        });
        const project = new Project('.');
        expect(project.yamlExtension).toEqual("yaml");
        (project.config.defaultExtension as any) = 'TEST';
        expect(project.yamlName).toEqual("package.yaml");
    });

    it('uses package.yml if detected', () => {
        mockFs({
            "package.yml": "",
        });
        const project = new Project('.');
        expect(project.yamlExtension).toEqual("yml");
        (project.config.defaultExtension as any) = 'TEST';
        expect(project.yamlName).toEqual("package.yml");
    });

    it('loads config from package-yaml.*', () => {
        mockFs(mockDirs.config_explicit);
        const project = new Project('.');
        expect(project.config.timestampFuzz).toEqual(35);
        expect(project.config.backupPath).toEqual('TEST_EXPLICIT');
    });

    it('loads config from package.* section', () => {
        mockFs(mockDirs.config_package);
        const project = new Project('.');
        expect(project.config.timestampFuzz).toEqual(40);
        expect(project.config.backupPath).toEqual('TEST_PACKAGE');
    });
});