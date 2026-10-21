import { describe, expect, it } from 'bun:test';
import * as discord from 'discord.js';
import CCBotImpl from '../src/ccbot-impl';

/// The name pattern that Discord accepts for slash commands.
const slashNamePattern = /^[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;

/// Creates a client that doesn't connect to Discord,
///  but has all of the commands registered.
async function createClient(): Promise<CCBotImpl> {
    const client = new CCBotImpl(
        {
            prefix: 'cc',
            intents: []
        },
        undefined,
        undefined,
        undefined
    );
    await client.loadData();
    return client;
}

describe('command registration', (): void => {
    it('should register the commands as slash commands', async (): Promise<void> => {
        const client = await createClient();
        const commands = client.registry.commands;
        expect(commands.size).toBeGreaterThan(0);
        for (const command of commands.values()) {
            // Every command must be usable as a slash command.
            expect(command.name).toMatch(slashNamePattern);
            expect(command.description.length).toBeGreaterThan(0);
            expect(command.description.length).toBeLessThanOrEqual(100);
            // The slash command data must exist and be valid.
            const slash = command.slashCommand;
            expect(slash).not.toBeNull();
            expect(slash!.name).toBe(command.name);
            expect(slash!.description).toBe(command.description);
            for (const option of slash!.options ?? []) {
                expect(option.name).toMatch(slashNamePattern);
                expect(option.description.length).toBeGreaterThan(0);
                expect(option.description.length).toBeLessThanOrEqual(100);
            }
        }
    });
    it('should not register the default prefix commands', async (): Promise<void> => {
        const client = await createClient();
        const names = Array.from(client.registry.commands.keys());
        for (const name of ['prefix', 'eval', 'command-state', 'unknown-command'])
            expect(names.includes(name)).toBe(false);
    });
    it('should register the JSON commands', async (): Promise<void> => {
        const client = await createClient();
        // A JSON command.
        const satoshi = client.registry.commands.get('satoshi');
        expect(satoshi).toBeDefined();
        expect(satoshi!.slashCommand).not.toBeNull();
        // The JSON commands that are too special to be slash commands are skipped.
        expect(client.registry.commands.get('unknown-command')).toBeUndefined();
    });
    it('should register the react command as a context menu command', async (): Promise<void> => {
        const client = await createClient();
        const react = client.registry.commands.get('react');
        expect(react).toBeDefined();
        expect(react!.contextMenuCommands.length).toBe(1);
        expect(react!.contextMenuCommands[0].type).toBe(discord.ApplicationCommandType.Message);
    });
});
