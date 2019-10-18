const mockLog = {
    verbose: jest.fn(),
    error: jest.fn(),
    levelMock: jest.fn(),
    set level(val:any) {
        this.levelMock(val);
    }
};

Object.seal(mockLog);

export = mockLog;