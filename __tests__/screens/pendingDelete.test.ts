import { runPendingDelete } from '@/src/screens/downloads/pendingDelete';

describe('runPendingDelete', () => {
  it('removes when pending has an id', () => {
    const removeFn = jest.fn();
    runPendingDelete({ id: 'd1' }, removeFn);
    expect(removeFn).toHaveBeenCalledWith('d1');
  });

  it('no-ops when pending is null or missing id', () => {
    const removeFn = jest.fn();
    runPendingDelete(null, removeFn);
    runPendingDelete(undefined, removeFn);
    runPendingDelete({ id: '' }, removeFn);
    expect(removeFn).not.toHaveBeenCalled();
  });
});
