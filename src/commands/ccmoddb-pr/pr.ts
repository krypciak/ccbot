// Copyright (C) 2019-2024 CCDirectLink members
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
import {CCBot, CCBotCommand} from '../../ccbot';

import * as prettier from 'prettier/standalone';
import * as prettierPluginBabel from 'prettier/plugins/babel';
import * as prettierPluginEstree from 'prettier/plugins/estree';

import {OctokitUtil} from './octokit';
import {InputLocations} from 'ccmoddb/build/src/types';

async function prettierJson(obj: any): Promise<string> {
    return await prettier.format(JSON.stringify(obj), {
        parser: 'json',
        plugins: [prettierPluginBabel, prettierPluginEstree],
        tabWidth: 4,
        printWidth: 170,
        bracketSameLine: true,
    });
}

async function checkUrlFileType(url: string): Promise<string | undefined> {
    try {
        const response = await fetch(url, {method: 'HEAD'});
        const contentType = response.headers.get('content-type');
        return contentType?.split(';')[0];
    } catch (error) {}
}

function addOrUpdateUrl(inputs: InputLocations, url: string) {
    const obj = {url};
    const repoUrl = url.split('/').slice(0, 5).join('/');
    for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        if (input.url.startsWith(repoUrl)) {
            inputs[i] = obj;
            return;
        }
    }
    inputs.push(obj);
}

const masterBranch = 'master';
const testingBranch = 'testing';
const botBranchPrefix = 'ccbot/';
const inputLocationsPath = 'input-locations.json';

async function createPr(url: string, author: string, isTestingBranch: boolean) {
    const branch = isTestingBranch ? testingBranch : masterBranch;
    if (!url.startsWith('https://github.com/') || !(url.endsWith('.zip') || url.endsWith('.ccmod'))) {
        return 'Invalid url :(';
    }
    const fileType = await checkUrlFileType(url);
    const okFileTypes = new Set(['application/zip', 'application/x-zip-compressed', 'application/octet-stream' /* <- ccmod */]);
    if (!fileType || !okFileTypes.has(fileType)) {
        return 'Invalid url :(';
    }

    try {
        const branches: string[] = (await OctokitUtil.getBranchList()).filter(name => name.startsWith(botBranchPrefix));
        const branchIds: number[] = branches.map(name => name.substring(botBranchPrefix.length)).map(Number);
        const maxBranchId: number = branchIds.reduce((acc, v) => (v > acc ? v : acc), -1);
        const newBranchName: string = `${botBranchPrefix}${maxBranchId + 1}`;

        await OctokitUtil.createBranch(branch, newBranchName);
        const inputLocationsStr = await OctokitUtil.fetchFile(branch, inputLocationsPath);
        const inputLocationsJson: InputLocations = JSON.parse(inputLocationsStr);
        addOrUpdateUrl(inputLocationsJson, url);

        const newContent = await prettierJson(inputLocationsJson);

        await OctokitUtil.commitFile(newBranchName, inputLocationsPath, newContent, `CCBot ${branch}: ${newBranchName}`);
        const prUrl = await OctokitUtil.createPullRequest(branch, newBranchName, `CCBot ${branch}: ${newBranchName}`, `Submitted by: <br>${author}`);
        return `PR submitted!\n${prUrl}`;
    } catch (err) {
        console.log(err);
        throw err;
    }
}

export default class ModsPrCommand extends CCBotCommand {
    public constructor(client: CCBot) {
        const opt = {
            name: 'publish-mod',
            description: 'Publish or update a mod to CCModDB, a central mod repository.',
            group: 'general',
            memberName: 'publish-mod',
            args: [
                {
                    key: 'url',
                    prompt: 'Mod .zip or .ccmod GitHub link',
                    type: 'string',
                },
                {
                    key: 'branch',
                    prompt: 'Target branch. Either "master" or "testing". Use "testing" if you want to publish this mod as a pre-release.',
                    type: 'string',
                    default: 'master'
                },
            ],
        };
        super(client, opt);
    }

    public async run(message: commando.CommandoMessage, args: {url: string; branch: string}): Promise<discord.Message | discord.Message[]> {
        let text: string;
        if (OctokitUtil.isInited()) {
            text = await createPr(args.url, message.author.tag, args.branch == 'testing');
        } else text = 'Not configured to be used here!';
        return await message.say(text);
    }
}
