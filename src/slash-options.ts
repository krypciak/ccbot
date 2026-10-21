// Copyright (C) 2019-2020 CCDirectLink members
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as discord from 'discord.js';
import * as commando from 'discord.js-commando';

/// The information needed to register a command as a slash command.
/// The name and the description are taken from the regular command info,
///  so they have to fit Discord's limits for slash commands.
export type SlashCommandInfo = commando.SlashCommandInfo;

/// A string option of a slash command.
export function stringOption(name: string, description: string, required: boolean = true): discord.ApplicationCommandOptionData {
    return {
        type: discord.ApplicationCommandOptionType.String,
        name,
        description,
        required
    };
}

/// An integer option of a slash command.
export function integerOption(name: string, description: string, required: boolean = true): discord.ApplicationCommandOptionData {
    return {
        type: discord.ApplicationCommandOptionType.Integer,
        name,
        description,
        required
    };
}

/// A boolean option of a slash command.
export function booleanOption(name: string, description: string, required: boolean = true): discord.ApplicationCommandOptionData {
    return {
        type: discord.ApplicationCommandOptionType.Boolean,
        name,
        description,
        required
    };
}

/// A user option of a slash command.
export function userOption(name: string, description: string, required: boolean = true): discord.ApplicationCommandOptionData {
    return {
        type: discord.ApplicationCommandOptionType.User,
        name,
        description,
        required
    };
}

/// A role option of a slash command.
export function roleOption(name: string, description: string, required: boolean = true): discord.ApplicationCommandOptionData {
    return {
        type: discord.ApplicationCommandOptionType.Role,
        name,
        description,
        required
    };
}

/// A channel option of a slash command.
export function channelOption(name: string, description: string, required: boolean = true): discord.ApplicationCommandOptionData {
    return {
        type: discord.ApplicationCommandOptionType.Channel,
        name,
        description,
        required
    };
}

/// Builds the slash command info of a command from its options.
export function slashInfo(options?: discord.ApplicationCommandOptionData[]): SlashCommandInfo {
    return {options: options ?? []};
}

/// A number option of a slash command.
export function numberOption(name: string, description: string, required: boolean = true): discord.ApplicationCommandOptionData {
    return {
        type: discord.ApplicationCommandOptionType.Number,
        name,
        description,
        required
    };
}

/// A mentionable option of a slash command.
export function mentionableOption(name: string, description: string, required: boolean = true): discord.ApplicationCommandOptionData {
    return {
        type: discord.ApplicationCommandOptionType.Mentionable,
        name,
        description,
        required
    };
}

/// The information about an argument of a command,
///  in a form that is loose enough to also accept the JSON commands' arguments.
export interface ArgumentInfoLike {
    key: string;
    prompt?: string | string[];
    type?: string | readonly string[];
    default?: unknown;
}

/// Converts a Commando-style argument list into slash command options.
/// The name of the option is the (lowercased) key of the argument,
///  which means that the argument is available under the same name in the command.
export function optionsFromArgs(args: readonly ArgumentInfoLike[]): discord.ApplicationCommandOptionData[] {
    return args.map((arg: ArgumentInfoLike): discord.ApplicationCommandOptionData => {
        const required = !('default' in arg) || arg.default === null;
        const name = arg.key.replace(/([A-Z]+)/g, '-$1').toLowerCase();
        const prompt = Array.isArray(arg.prompt) ? arg.prompt[0] : arg.prompt;
        const description = prompt && prompt.length > 0 ? prompt : name;
        const type = Array.isArray(arg.type) ? arg.type[0] : arg.type;
        switch (type) {
            case 'integer':
                return integerOption(name, description, required);
            case 'number':
            case 'float':
                return numberOption(name, description, required);
            case 'boolean':
                return booleanOption(name, description, required);
            case 'user':
                return userOption(name, description, required);
            case 'role':
                return roleOption(name, description, required);
            case 'channel':
            case 'category-channel':
            case 'forum-channel':
                return channelOption(name, description, required);
            case 'mentionable':
                return mentionableOption(name, description, required);
            default:
                return stringOption(name, description, required);
        }
    });
}

/// Turns a name into something that Discord accepts as a slash command name.
export function sanitizeSlashName(name: string): string {
    const cleaned = name
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^[-_]+|[-_]+$/g, '');
    return cleaned.substring(0, 32);
}

/// Finds a free slash command name for a command with the given name in the given group.
///
/// The names of the JSON commands are not necessarily valid slash command names,
///  so they have to be sanitized. If that causes a conflict with an already used name,
///  the group name is used as a prefix. If that conflicts as well, a number is appended.
export function resolveSlashName(name: string, group: string, isTaken: (candidate: string) => boolean): string {
    const base = sanitizeSlashName(name) || 'command';
    if (!isTaken(base))
        return base;
    const groupPrefix = sanitizeSlashName(group) || 'group';
    // Reserve room for the prefix and the separator.
    const stem = `${groupPrefix}-${base.substring(0, 32 - groupPrefix.length - 1)}`;
    if (!isTaken(stem))
        return stem;
    for (let i = 2; i < 1000; i++) {
        const suffix = `-${i}`;
        const candidate = `${stem.substring(0, 32 - suffix.length)}${suffix}`;
        if (!isTaken(candidate))
            return candidate;
    }
    return stem;
}
