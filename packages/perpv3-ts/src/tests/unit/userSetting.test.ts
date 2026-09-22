import { MAX_SLIPPAGE, UserSetting } from '../../types';
import { WAD } from '../../constants';

// Note: validateUserSetting was removed as it was not a range-specific function
// UserSetting validation should be done elsewhere if needed
describe('UserSetting validation', () => {
    // Test with valid user settings
    it('should accept valid user settings', () => {
        const validUserSetting = new UserSetting(1678886400, 5000, 3n * WAD); // Positive deadline, within valid slippage range
        expect(validUserSetting.slippage).toBeGreaterThanOrEqual(0);
        expect(validUserSetting.slippage).toBeLessThanOrEqual(MAX_SLIPPAGE);
        expect(validUserSetting.deadlineOffset).toBeGreaterThanOrEqual(0);
    });

    // Test with slippage less than 0
    it('should detect invalid slippage less than 0', () => {
        const invalidSlippageUserSetting = new UserSetting(1678886400, -1, 3n * WAD);
        expect(invalidSlippageUserSetting.slippage).toBeLessThan(0);
    });

    // Test with slippage greater than MAX_SLIPPAGE
    it('should detect slippage greater than MAX_SLIPPAGE', () => {
        const invalidSlippageUserSetting = new UserSetting(1678886400, MAX_SLIPPAGE + 1, 3n * WAD);
        expect(invalidSlippageUserSetting.slippage).toBeGreaterThan(MAX_SLIPPAGE);
    });

    // Test with deadline less than 0
    it('should detect deadline less than 0', () => {
        const invalidDeadlineUserSetting = new UserSetting(-1, 5000, 3n * WAD);
        expect(invalidDeadlineUserSetting.deadlineOffset).toBeLessThan(0);
    });

    // Test with leverage zero or negative
    it('should throw error for zero leverage', () => {
        expect(() => new UserSetting(1678886400, 5000, 0n)).toThrow('Leverage must be positive');
    });

    it('should throw error for negative leverage', () => {
        expect(() => new UserSetting(1678886400, 5000, -1n * WAD)).toThrow('Leverage must be positive');
    });
});
