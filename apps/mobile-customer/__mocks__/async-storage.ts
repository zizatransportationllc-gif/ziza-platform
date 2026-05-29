/**
 * Manual mock for @react-native-async-storage/async-storage
 * Used in Jest tests via moduleNameMapper.
 */
const _store: Record<string, string> = {};

const AsyncStorageMock = {
  setItem: jest.fn(async (key: string, value: string): Promise<void> => {
    _store[key] = value;
  }),
  getItem: jest.fn(async (key: string): Promise<string | null> => {
    return _store[key] ?? null;
  }),
  removeItem: jest.fn(async (key: string): Promise<void> => {
    delete _store[key];
  }),
  clear: jest.fn(async (): Promise<void> => {
    Object.keys(_store).forEach((k) => delete _store[k]);
  }),
  getAllKeys: jest.fn(async (): Promise<string[]> => Object.keys(_store)),
  multiGet: jest.fn(
    async (keys: string[]): Promise<Array<[string, string | null]>> =>
      keys.map((k) => [k, _store[k] ?? null])
  ),
  multiSet: jest.fn(async (pairs: [string, string][]): Promise<void> => {
    pairs.forEach(([key, value]) => { _store[key] = value; });
  }),
  multiRemove: jest.fn(async (keys: string[]): Promise<void> => {
    keys.forEach((k) => delete _store[k]);
  }),
};

export default AsyncStorageMock;
