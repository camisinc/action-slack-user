import * as core from '@actions/core';
import { WebClient } from '@slack/web-api';
import { context, getOctokit } from '@actions/github';

/**
 * Fetch GitHub user's email based on the SHA associated with the current GitHub Action context
 * @param {*} token GitHub Personal Access Token, used to interact with the GitHub REST API
 * @returns The GitHub user's email address, or undefined if not found or an error occurs
 */
async function fetchGitHubEmailByContextSha(token) {
    try {
        const octokit = getOctokit(token);

        // Determine the correct SHA based on event type
        let sha;
        if (context.payload.pull_request) {
            // Direct pull_request event
            sha = context.payload.pull_request.head.sha;
            core.info(`Using pull_request.head.sha: ${sha}`);
        } else if (context.payload.check_suite) {
            // check_suite event (e.g., when checks complete on a PR)
            sha = context.payload.check_suite.head_sha;
            core.info(`Using check_suite.head_sha: ${sha}`);
        } else {
            // Fallback to context.sha for other events (push, etc.)
            sha = context.sha;
            core.info(`Using context.sha: ${sha}`);
        }

        // Fetch commit from GitHub
        const data = await octokit.rest.repos.getCommit({
            owner: context.repo.owner,
            repo: context.repo.repo,
            ref: sha
        });

        if (!data) {
            core.error('An error occurred fetching the commit from GitHub');
            return undefined;
        }

        // Retrieve the email address associated with the commit
        const email = data.data.commit.author.email;
        if (!email) {
            core.error("Could not find an email address associated with the commit");
            return undefined;
        }

        return email;
    } catch (err) {
        core.error(`Failed to fetch commit: ${err.message}`);
        return undefined;
    }
}

/**
 * Fetch GitHub user's email based on the provided GitHub username
 * @param {*} username The GitHub user's login
 * @param {*} token GitHub Personal Access Token, used to interact with the GitHub REST API
 * @returns The GitHub user's email address, or undefined if not found/public
 */
async function fetchGitHubEmailByUsername(username, token) {
    try {
        const octokit = getOctokit(token);

        const { data: user } = await octokit.rest.users.getByUsername({
            username
        });

        if (!user) {
            core.warning('Could not fetch user from GitHub - user may not exist');
            return undefined;
        }

        if (!user.email) {
            core.warning(`User '${username}' has no public email available`);
            return undefined;
        }

        return user.email;
    } catch (err) {
        core.warning(`Failed to fetch user by username: ${err.message}`);
        return undefined;
    }
}

/**
 * Uses a user's email address in Slack to determine the user's username
 * @param {*} email The email address associated with a user in Slack
 * @param {*} token A Slack API Token used to retrieve users from a Slack organization.
 * @returns A username in Slack that's associated with the provided email
 */
async function fetchSlackUser(email, token) {
    try {
        // Initialize an instance of the Slack web client.
        const web = new WebClient(token);

        const result = await web.users.lookupByEmail({ email });
        if (!result.ok) {
            core.error(`An error occurred fetching user from Slack: ${result.error}`);
            return undefined;
        }

        const user = result.user;
        if (!user) {
            core.error(`Could not find an associated Slack user for email: ${email}`);
            return undefined;
        }

        return { memberId: user.id, username: user.name};
    } catch (err) {
        core.error(`Failed to fetch Slack user: ${err.message}`);
        return undefined;
    }
}

/**
 * Main orchestration function, takes in input from GitHub Actions and sets the output to the Slack member id if one was found.
 */
(async () => {
    const githubToken = core.getInput('github-token');
    const slackToken = core.getInput('slack-token');
    const username = core.getInput('username');

    let email;

    if (username) {
        email = await fetchGitHubEmailByUsername(username, githubToken);

        // If username lookup didn't return an email, try to fetch from context as a fallback
        if (!email) {
            core.info(`Username '${username}' has no public email, falling back to context SHA`);
            email = await fetchGitHubEmailByContextSha(githubToken);
        }
    } else {
        email = await fetchGitHubEmailByContextSha(githubToken);
    }

    if (!email) {
        core.setFailed(`Failed to find GitHub user's email`);
        return;
    }

    core.info(`GitHub user email: ${email}`);

    if (email.includes('dependabot[bot]@users.noreply.github.com')) {
        core.setOutput('member-id', 'dependabot');
        core.setOutput('username', 'dependabot');
        return;
    } else if (email.includes('noreply.github.com')) {
        // If the email is a noreply/private email, just pass the action through and set the outputs to the noreply user
        core.info(`User email is a noreply email, which is not allowed`);
        core.setOutput('member-id', 'noreply');
        core.setOutput('username', 'noreply');
        return;
    }

    // Retrieve the user's member id in Slack
    const slackUser = await fetchSlackUser(email, slackToken);
    if (!slackUser) {
        core.setFailed(`An error occurred fetching user from Slack with email ${email}`);
        return;
    }

    core.setOutput('member-id', slackUser.memberId);
    core.setOutput('username', slackUser.username);
})();
