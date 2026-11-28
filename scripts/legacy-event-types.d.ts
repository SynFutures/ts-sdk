// Some published v5 bindings use TypeChain's tuple/object event generics.
import type { TypedEvent, TypedEventFilter as Filter, TypedListener as Listener } from './common';
export * from './common';
export type TypedEventFilter<Args extends unknown[], Fields> = Filter<TypedEvent<Args, Fields>>;
export type TypedListener<Args extends unknown[], Fields> = Listener<TypedEvent<Args, Fields>>;
