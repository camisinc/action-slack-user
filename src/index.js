import * as core from '@actions/core';
import { WebClient } from '@slack/web-api';
import { context, getOctokit } from '@actions/github';

/**
 * Given a user's username in GitHub the user's email is retrieved
 * @param {*} token GitHub Personal Access Token, used to interact with the GitHub REST API
 * @returns The GitHub user's email address
 */
async function fetchGitHubEmail(token) {
    try {
        const octokit = getOctokit(token);
        // Fetch commit from GitHub
        const data = await octokit.rest.repos.getCommit({
            owner: context.repo.owner,
            repo: context.repo.repo,
            ref: context.sha
        });

        if (!data) {
            core.setFailed('An error occurred fetching the commit from GitHub');
            return undefined;
        }
        core.debug(`commit: ${JSON.stringify(data)}`);
        // Retrieve the email address associated with the commit
        const email = data.data.commit.author.email;
        if (!email) {
            core.setFailed("Could not find an email address associated with the commit");
        }
        return email;
    } catch (err) {
        core.setFailed(`error: ${err}`);
        return undefined;
    }
}

/**
 * Uses a user's email address in slack to determine the user's username
 * @param {*} email The email address associated with a user in Slack
 * @param {*} token A Slack API Token used to retrieve user's from a slack organization.
 * @returns A username in slack that's associated with the provided email
 */
async function fetchSlackUser(email, token) {
    try {
        // Initialize an instance of the slack web client.
        const web = new WebClient(token);

        // Fetch all slack users
        const result = await web.users.lookupByEmail({ email });
        if (!result.ok) {
            core.setFailed(`An error occurred fetching user from slack: ${result.error}`);
            return undefined;
        }

        // Find the slack user associated with the github email address
        const user = result.user;
        if (!user) {
            core.setFailed(`Could not find an associated slack user ${email}`);
            return undefined;
        }
        return { memberId: user.id, username: user.name};
    } catch (err) {
        core.setFailed(`error: ${err}`)
        return undefined;
    }
}

/**
 * Main orchestration function, takes in input from github actions and sets the output to the slack member id if one was found.
 */
(async () => {
    const githubToken = core.getInput('github-token');
    const slackToken = core.getInput('slack-token');

    // Retrieve the user's email in GitHub
    const email = await fetchGitHubEmail(githubToken);
    if (!email) {
        core.setFailed(`Failed to find email associated with commit`);
        return;
    }
    
    if (email.includes('dependabot[bot]@users.noreply.github.com')) {
        core.setOutput('member-id', 'dependabot');
        core.setOutput('username', 'dependabot');
        return;
    }

    // Retrieve the user's member id in slack
    const slackUser = await fetchSlackUser(email, slackToken);
    if (!slackUser) {
        core.setFailed(`An error occurred fetching user from slack with email ${email}`);
        return;
    }
    core.setOutput('member-id', slackUser.memberId);
    core.setOutput('username', slackUser.username);
})();