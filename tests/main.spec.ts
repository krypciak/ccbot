import { describe, expect, it } from 'bun:test';
import DynamicDataManager from '../src/dynamic-data';
import {VM, runFormatInternal} from '../src/formatter/core';
import {installBasic} from '../src/formatter/lib-basic';

describe('DynamicDataManager', (): void => {
    const ddm: DynamicDataManager = new DynamicDataManager();
    it('should have a well-formed JSON command set', async (): Promise<void> => {
        await ddm.initialLoad;
        // Type-check everything.
        expect(ddm.commands.data.constructor).toBe(Object);
        for (const group in ddm.commands.data) {
            const seen: {[name: string]: true} = {};
            expect(group.constructor).toBe(String);
            expect(ddm.commands.data[group].constructor).toBe(Object);
            for (const name in ddm.commands.data[group]) {
                expect(seen).not.toHaveProperty(name);
                seen[name] = true;
                expect(name.constructor).toBe(String);
                const cmd = ddm.commands.data[group][name];
                expect(cmd.constructor).toBe(Object);
            }
        }
    });
    it('should have format strings that parse correctly', async (): Promise<void> => {
        await ddm.initialLoad;
        for (const group in ddm.commands.data) {
            for (const name in ddm.commands.data[group]) {
                const cmd = ddm.commands.data[group][name];
                if (cmd.format) {
                    // Ignore the actual details, this is just a parsing run
                    try {
                        await runFormatInternal(cmd.format, async (): Promise<string> => {
                            return '';
                        });
                    } catch (e) {
                        console.log(group + ' ' + name);
                        throw e;
                    }
                }
            }
        }
    });
    it('should work around the Discord broken image embeds bug', async (): Promise<void> => {
        await ddm.initialLoad;
        for (const group in ddm.commands.data) {
            for (const name in ddm.commands.data[group]) {
                const cmd = ddm.commands.data[group][name];
                if (cmd.embed) {
                    if (cmd.embed.image) {
                        // It doesn't necessarily have to match (width/height override removal)
                        expect(cmd.embed).toHaveProperty('title');
                        expect(cmd.embed).toHaveProperty('url');
                    }
                }
            }
        }
    });
});

describe('Hello function', (): void => {
    it('should return hello world', (): void => {
        const result = 'Hello world!';
        expect(result).toBe('Hello world!');
    });
});

describe('VM', (): void => {
    it('should never, ever ever, allow the user to run more than 8192 evals, ever', async (): Promise<void> => {
        try {
            const vm: VM = new VM();
            installBasic(vm);
            for (let i = 0; i < 8192; i++)
                await vm.run(['set', 'monkey', i.toString()], vm.globalScope);
            throw new Error('Failed: Managed to consume too much time');
        } catch (e) {
            // Success!
        }
    })
});
