import type { BigNumber } from 'ethers';
import type { BaseInterface } from '../types';
export interface CalcInterface extends BaseInterface {
    alignPriceToTick(
        instrumentAddr: string,
        price: BigNumber
    ): Promise<{
        tick: number;
        price: BigNumber;
    }>;
    getWadAtTick(instrumentAddr: string, tick: number): Promise<BigNumber>;
    getTickAtPWad(instrumentAddr: string, price: BigNumber): Promise<number>;
    getWadAtTicks(
        instrumentAddr: string,
        lowerTick: number,
        upperTick: number
    ): Promise<{
        lowerPrice: BigNumber;
        upperPrice: BigNumber;
    }>;
    sqrtX96ToWad(instrumentAddr: string, sqrtPX96: BigNumber): Promise<BigNumber>;
}
