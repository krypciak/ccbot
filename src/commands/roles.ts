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
import {CCBot, CCBotCommand} from '../ccbot';
import {convertRoleGroup, convertRoles, getUserDeniedRoles} from '../role-utils';
import {doneResponse} from '../utils';
import {outputElements} from '../entities/page-switcher';
import {argList, respond} from '../command-context';
import {slashInfo, stringOption} from '../slash-options';

/// Gets inclusivity/exclusivity group involvement given a target and a role ID list.
function getInvolvement(client: CCBot, guild: discord.Guild, groupType: string, involvedIDs: string[]): string[] {
    const involvement: string[] = [];
    const groups: string[] = client.provider?.get(guild, `roles-${groupType}`, []) ?? [];
    for (const v of groups) {
        const roles: string[] = convertRoleGroup(client, guild, v);
        for (const r of involvedIDs) {
            if (roles.includes(r)) {
                involvement.push(v);
                break;
            }
        }
    }
    return involvement;
}

function getWhitelist(client: CCBot, guild: discord.Guild): string[] {
    const whitelistGroups: string[] = client.provider?.get(guild, 'roles-whitelist', []) ?? [];
    const whitelist: string[] = [];
    for (const v of whitelistGroups)
        for (const v2 of convertRoleGroup(client, guild, v))
            whitelist.push(v2);
    return whitelist;
}

/// There's a lot of common stuff this combines into one function.
/// Notably, this assumes that whoever causes this to be run, they are authorized to do so.
/// If this may not be the case, add the checks in the calling function; this function focuses on the logic of the effects.
export async function runRoleCommand(client: CCBot<boolean>, member: discord.GuildMember, roles: string[], add: boolean): Promise<string> {

    const userRoles = Array.from(member.roles.cache.keys());
    const request = convertRoles(client, member.guild, roles, false);
    if (!request)
        return 'The request contained invalid roles.';

    // -- Check that all roles are allowed --

    const whitelist: string[] = getWhitelist(client as CCBot, member.guild);
    for (const v of request)
        if (!whitelist.includes(v))
            return 'You don\'t have permission for some of these roles.';

    // -- Command action filtration --

    const addRoles: string[] = [];
    const removeRoles: string[] = [];
    let primaryRoles: string[];
    if (add) {
        for (const v of request)
            if (!userRoles.includes(v))
                addRoles.push(v);
        primaryRoles = addRoles;
    } else {
        for (const v of request)
            if (userRoles.includes(v))
                removeRoles.push(v);
        primaryRoles = removeRoles;
    }

    // -- Involvement processing --

    const involvedGroups = getInvolvement(client, member.guild, add ? 'exclusive' : 'inclusive', primaryRoles);
    for (const groupName of involvedGroups) {
        const groupContent: string[] = convertRoleGroup(client, member.guild, groupName);
        if (add) {
            // If any roles are already active in the group, remove them.
            // This leaves only one role (the one that caused the involvement)
            for (const conflict of groupContent)
                if (userRoles.includes(conflict))
                    removeRoles.push(conflict);
        } else {
            // Need to check that at least one other role of the group is present.
            let ok = false;
            for (const potential of groupContent) {
                if (userRoles.includes(potential)) {
                    if (!removeRoles.includes(potential)) {
                        ok = true;
                        break;
                    }
                }
            }
            if (!ok)
                return `You need at least one ${groupName} role.`;
        }
    }

    // -- Denial checks --

    const denial = getUserDeniedRoles(client, member);
    if (addRoles.filter((v: string): boolean => denial.includes(v)).length > 0)
        return 'Some added roles are denied.';

    // -- Action performance & description --

    if (removeRoles.length > 0)
        await member.roles.remove(removeRoles);
    if (addRoles.length > 0)
        await member.roles.add(addRoles);

    return doneResponse();
}

async function genericARRunner(interaction: commando.CommandoInteraction, args: {roles: string}, add: boolean): Promise<void> {
    if (!interaction.member) {
        await respond(interaction, 'There aren\'t roles in a DM channel.');
        return;
    }
    await respond(interaction, await runRoleCommand(interaction.client as CCBot<true>, interaction.member, argList(args.roles), add));
}

/// A command for someone to add roles to themselves using the bot.
export class RolesAddCommand extends CCBotCommand {
    public constructor(client: CCBot) {
        const opt: commando.CommandInfo = {
            name: 'role-add',
            description: 'Gives you roles.',
            group: 'roles',
            memberName: 'add'
        };
        super(client, opt, slashInfo([
            stringOption('roles', 'Roles to add?')
        ]));
    }

    public async run(interaction: commando.CommandoInteraction, args: {roles: string}): Promise<void> {
        await genericARRunner(interaction, args, true);
    }
}

/// A command for someone to remove roles from themselves using the bot.
export class RolesRmCommand extends CCBotCommand {
    public constructor(client: CCBot) {
        const opt: commando.CommandInfo = {
            name: 'role-rm',
            description: 'Removes roles from you.',
            group: 'roles',
            memberName: 'rm'
        };
        super(client, opt, slashInfo([
            stringOption('roles', 'Roles to remove?')
        ]));
    }

    public async run(interaction: commando.CommandoInteraction, args: {roles: string}): Promise<void> {
        await genericARRunner(interaction, args, false);
    }
}


/// A command for someone to remove roles from themselves using the bot.
export class RolesListCommand extends CCBotCommand {
    public constructor(client: CCBot) {
        const opt = {
            name: 'role-list',
            description: 'Lists all roles.',
            group: 'roles',
            memberName: 'get'
        };
        super(client, opt, slashInfo());
    }

    public async run(interaction: commando.CommandoInteraction): Promise<void> {
        if (!interaction.guild) {
            await respond(interaction, 'You are floating in a void, free, unburdened by any force, not even gravity.\nThus, your roles are what you will them to be.');
            return;
        }
        const guild = interaction.guild;
        const whitelist = getWhitelist(this.client, guild);
        const autorole = convertRoleGroup(this.client, guild, 'auto-role');
        const linesInteresting: string[] = [];
        const lines: string[] = [];
        for (const role of guild.roles.cache.values()) {
            const caps: string[] = [];
            if (autorole.includes(role.id))
                caps.push('automatic');
            if (whitelist.includes(role.id))
                caps.push(`grantable (\`/role-add /role-rm ${role.name}\`)`);
            const inccaps: string[] = getInvolvement(this.client, guild, 'inclusive', [role.id]);
            if (inccaps.length != 0)
                caps.push(`inclusive (${inccaps.join()})`);
            const exccaps: string[] = getInvolvement(this.client, guild, 'exclusive', [role.id]);
            if (exccaps.length != 0)
                caps.push(`exclusive (${exccaps.join()})`);
            (caps.length > 0 ? linesInteresting : lines).push(`\`${role.name}\` ${caps.join()}`)
        }
        await outputElements(this.client, interaction, linesInteresting.concat(lines), 10, 2000);
    }
}
