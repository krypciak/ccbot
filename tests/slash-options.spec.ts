import { describe, expect, it } from 'bun:test';
import * as discord from 'discord.js';
import {argList} from '../src/command-context';
import {optionsFromArgs, resolveSlashName, sanitizeSlashName} from '../src/slash-options';
import DynamicDataManager from '../src/dynamic-data';

/// Whether an option is required. Subcommands don't have that property.
function isRequired(option: discord.ApplicationCommandOptionData): boolean | undefined {
    return 'required' in option ? option.required : undefined;
}

/// The names of the commands that are built into the bot.
/// If a command is added or renamed, this list has to be updated.
const builtInCommandNames = [
    'reload-json',
    'settings-get-global', 'settings-set-global', 'settings-rm-global',
    'settings-get-local', 'settings-set-local', 'settings-rm-local',
    'settings-get-user', 'settings-set-user', 'settings-rm-user',
    'show-user-settings',
    'counter',
    'add-quote', 'rm-quote',
    'cheese-army', 'leacheese-army',
    'ping',
    'list-emotes', 'list-emotes-sfw',
    'emote', 'react',
    'say', 'hug', 'purge', 'inspire', 'invite',
    'help',
    'role-add', 'role-rm', 'role-list',
    'mods', 'tools',
    'publish-mod'
];

/// The name pattern that Discord accepts for slash commands.
const slashNamePattern = /^[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;

describe('sanitizeSlashName', (): void => {
    it('should lowercase names', (): void => {
        expect(sanitizeSlashName('HI!')).toBe('hi');
        expect(sanitizeSlashName('EXPLOSION!')).toBe('explosion');
    });
    it('should replace illegal characters', (): void => {
        expect(sanitizeSlashName("help-'")).toBe('help');
        expect(sanitizeSlashName('a b')).toBe('a-b');
        expect(sanitizeSlashName('a//b')).toBe('a-b');
    });
    it('should keep legal characters', (): void => {
        expect(sanitizeSlashName('cheese-army')).toBe('cheese-army');
        expect(sanitizeSlashName('list_emotes')).toBe('list_emotes');
        expect(sanitizeSlashName('1234')).toBe('1234');
    });
    it('should not exceed the maximum length', (): void => {
        expect(sanitizeSlashName('a'.repeat(100)).length).toBe(32);
    });
});

describe('optionsFromArgs', (): void => {
    it('should convert string arguments', (): void => {
        const options = optionsFromArgs([{key: 'args', prompt: 'Who is the cheater?', type: 'string'}]);
        expect(options.length).toBe(1);
        expect(options[0].name).toBe('args');
        expect(options[0].description).toBe('Who is the cheater?');
        expect(isRequired(options[0])).toBe(true);
    });
    it('should make arguments with a default optional', (): void => {
        const options = optionsFromArgs([{key: 'seconds', prompt: 'How long?', type: 'integer', default: 60}]);
        expect(isRequired(options[0])).toBe(false);
    });
    it('should convert the argument types', (): void => {
        const options = optionsFromArgs([
            {key: 'number', type: 'integer'},
            {key: 'text', type: 'string'},
            {key: 'flag', type: 'boolean'},
            {key: 'person', type: 'user'},
            {key: 'role', type: 'role'},
            {key: 'place', type: 'channel'},
            {key: 'thing', type: 'mentionable'}
        ]);
        expect(options.map((o): string => o.name)).toEqual(['number', 'text', 'flag', 'person', 'role', 'place', 'thing']);
        expect(options.every((o): boolean => o.description.length > 0)).toBe(true);
    });
    it('should convert camelCase keys into dashed names', (): void => {
        const options = optionsFromArgs([{key: 'messageId', type: 'string'}]);
        expect(options[0].name).toBe('message-id');
    });
});

describe('resolveSlashName', (): void => {
    it('should use the plain name if it is free', (): void => {
        expect(resolveSlashName('hi', 'general', (): boolean => false)).toBe('hi');
    });
    it('should use the group as a prefix on conflicts', (): void => {
        const taken = new Set(['hi']);
        expect(resolveSlashName('hi', 'general', (name: string): boolean => taken.has(name))).toBe('general-hi');
    });
    it('should use a number if the prefixed name is taken as well', (): void => {
        const taken = new Set(['hi', 'general-hi']);
        expect(resolveSlashName('hi', 'general', (name: string): boolean => taken.has(name))).toBe('general-hi-2');
    });
    it('should not exceed the maximum length', (): void => {
        const taken = new Set(['a'.repeat(32)]);
        const name = resolveSlashName('a'.repeat(32), 'general', (n: string): boolean => taken.has(n));
        expect(name.length).toBeLessThanOrEqual(32);
    });
});

describe('JSON command names', (): void => {
    it('should resolve to unique names that Discord accepts', async (): Promise<void> => {
        const ddm: DynamicDataManager = new DynamicDataManager();
        await ddm.initialLoad;
        const taken = new Set<string>(builtInCommandNames);
        const names: string[] = [];
        for (const group in ddm.commands.data) {
            for (const name in ddm.commands.data[group]) {
                // The unknown command command has no meaning as a slash command.
                if (name.toLowerCase() === 'unknown-command')
                    continue;
                const resolved = resolveSlashName(name, group, (candidate: string): boolean => taken.has(candidate));
                taken.add(resolved);
                names.push(resolved);
            }
        }
        for (const name of names)
            expect(name).toMatch(slashNamePattern);
        expect(new Set(names).size).toBe(names.length);
    });
    it('should not conflict with the built-in commands', async (): Promise<void> => {
        const ddm: DynamicDataManager = new DynamicDataManager();
        await ddm.initialLoad;
        // The built-in commands are registered first, so they get their names.
        const taken = new Set<string>(builtInCommandNames);
        const names: string[] = [];
        for (const group in ddm.commands.data) {
            for (const name in ddm.commands.data[group]) {
                if (name.toLowerCase() === 'unknown-command')
                    continue;
                const resolved = resolveSlashName(name, group, (candidate: string): boolean => taken.has(candidate));
                taken.add(resolved);
                names.push(resolved);
            }
        }
        for (const name of names)
            expect(builtInCommandNames.includes(name)).toBe(false);
    });
    it('should resolve the known name conflicts', async (): Promise<void> => {
        const ddm: DynamicDataManager = new DynamicDataManager();
        await ddm.initialLoad;
        const taken = new Set<string>(builtInCommandNames);
        const names = new Map<string, string>();
        for (const group in ddm.commands.data) {
            for (const name in ddm.commands.data[group]) {
                if (name.toLowerCase() === 'unknown-command')
                    continue;
                const resolved = resolveSlashName(name, group, (candidate: string): boolean => taken.has(candidate));
                taken.add(resolved);
                names.set(`${group}/${name}`, resolved);
            }
        }
        // The help command of the bot takes precedence over the one of the formatter.
        expect(names.get('formatter/help-\'')).toBe('formatter-help');
        // The two lewd commands are disambiguated by their group.
        expect(names.get('general/lewd')).toBe('lewd');
        expect(names.get('nsfw/lewd')).toBe('nsfw-lewd');
        // The two hi commands are disambiguated by their group.
        expect(names.get('general/hi')).toBe('hi');
        expect(names.get('general/HI!')).toBe('general-hi');
    });
});

describe('argList', (): void => {
    it('should split a string into a list', (): void => {
        expect(argList('a b c')).toEqual(['a', 'b', 'c']);
        expect(argList('  a   b  ')).toEqual(['a', 'b']);
    });
    it('should handle empty input', (): void => {
        expect(argList(undefined)).toEqual([]);
        expect(argList(null)).toEqual([]);
        expect(argList('')).toEqual([]);
    });
    it('should keep lists as they are', (): void => {
        expect(argList(['a', 'b'])).toEqual(['a', 'b']);
    });
});
