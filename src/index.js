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
            core.error('An error occurred fetching the commit from GitHub');
            return undefined;
        }
        core.debug(`commit: ${JSON.stringify(data)}`);
        // Retrieve the email address associated with the commit
        const email = data.data.commit.author.email;
        if (!email) {
            core.error("Could not find an email address associated with the commit");
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

        const result = await web.users.lookupByEmail({ email });
        if (!result.ok) {
            core.error(`An error occurred fetching user from slack: ${result.error}`);
            return undefined;
        }

        const user = result.user;
        if (!user) {
            core.error(`Could not find an associated slack user ${email}`);
            return undefined;
        }
        return { memberId: user.id, username: user.name};
    } catch (err) {
        core.setFailed(`error: ${err}`)
        return undefined;
    }
}

/**
 * Takes a string in the shape name.surname@company.com
 * and returns it as nsurname@company.com
 * otherwise undefined.
 */
function transformCorporateEmail(email) {
    const emailParts = email.split("@");
    const emailRecipient = emailParts[0];
    const emailDomain = emailParts[1];
    if (emailRecipient.split('.').length != 2) {
        core.debug(`Did not transform corp email because more than one '.' found: ${email}`);
        return undefined;
    }

    if (emailRecipient.includes(".")) {
        const parts = emailRecipient.split(".");
        const name = parts[0];
        const surname = parts[1];
        return name.substring(0, 1) + surname + "@" + emailDomain;
    }
    return undefined;
}

async function fetchSlackUserManipulatingEmail(email, token) {
    const candidates = [email];
    const corpEmail = transformCorporateEmail(email);
    if (corpEmail) {
        candidates.push(corpEmail);
    }
    for (const candidate of candidates) {
        const slackUser = await fetchSlackUser(candidate, token);
        core.info(`Slack user for candidate address '${candidate}' was '${JSON.stringify(slackUser)}'.`);
        if (slackUser) {
            return slackUser;
        }
    }
    return undefined;
}

/**
 * A GitHub user can decide to set their email as private, and not share the actual address publicly.
 * https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-email-preferences/setting-your-commit-email-address
 * 
 * In these situations, GitHub will set the used actor email as either USERNAME@users.noreply.github.com or ID+USERNAME@users.noreply.github.com
 */
function isGitHubUserEmailPrivate(email) {
    const emailParts = email.split("@");
    const emailDomain = emailParts[1];
    return emailDomain === "users.noreply.github.com";
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
        core.setFailed(`Failed to find email associated with commit ${context.sha}`);
        return;
    }

    if (isGitHubUserEmailPrivate(email)) {
        core.info(`The GitHub user set their email as private: ${email}`);
        return;
    }
    
    // Retrieve the user's member id in slack
    const slackUser = await fetchSlackUserManipulatingEmail(email, slackToken);
    if (!slackUser) {
        core.setFailed(`An error occurred fetching user from slack with email ${email}`);
        return;
    }
    core.setOutput('member-id', slackUser.memberId);
    core.setOutput('username', slackUser.username);
})();
