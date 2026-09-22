import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Stage and validate the full generation before replacing any existing file.
export function publishSnapshot(staging, destination) {
    const names = ['state.json', 'manifest.json', 'state.meta.json'];
    for (const name of names) JSON.parse(readFileSync(path.join(staging, name), 'utf8'));
    const previous = new Map(
        names.map((name) => {
            const target = path.join(destination, name);
            return [name, existsSync(target) ? readFileSync(target) : null];
        })
    );
    const published = [];
    try {
        for (const name of names) {
            renameSync(path.join(staging, name), path.join(destination, name));
            published.push(name);
        }
    } catch (error) {
        for (const name of published.reverse()) {
            const old = previous.get(name);
            const target = path.join(destination, name);
            if (old === null) rmSync(target, { force: true });
            else writeFileSync(target, old);
        }
        throw error;
    }
}
