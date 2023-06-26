const { WebClient } = require('@slack/web-api');
const core = require('@actions/core');
const github = require('@actions/github');

/**
 * Given a user's username in GitHub the user's email is retrieved
 * @param {*} username A username associated with a user in GitHub.
 * @param {*} token GitHub Personal Access Token, used to interact with the GitHub REST API
 * @returns The GitHub user's email address
 */
async function fetchGitHubEmail(repo, owner, ref, token) {
    try {
        const octokit = github.getOctokit(token);
        const data = await octokit.rest.repos.getCommit({
            owner,
            repo,
            ref
        });
        if (!data) {
            core.setFailed(`Failed to retrieve commit for ${ref}`);
            return undefined;
        }
        const email = data.commit.author.email;
        if (!email) {
            core.setFailed(`Failed to retrieve author of ${ref}`);
            return undefined;
        }
        return email;
    } catch (err) {
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
        const result = await web.users.list();
        if (!result.ok) {
            core.setFailed('An error occurred fetching users from slack');
            return undefined;
        }

        // Find the slack user associated with the github email address
        const user = result.members.find(member => member.profile.email === email);
        if (!user) {
            core.setFailed('Could not find an associated slack user');
            return undefined;
        }
        return { memberId: user.id, username: user.name};
    } catch (err) {
        return undefined;
    }
}

/**
 * Main orchestration function, takes in input from github actions and sets the output to the slack member id if one was found.
 */
(async () => {
    const repository = core.getInput('repo');
    const organization = core.getInput('org');
    const githubToken = core.getInput('github-token');
    const ref = core.getInput('ref');
    const slackToken = core.getInput('slack-token');

    // Retrieve the user's email in GitHub
    const email = await fetchGitHubEmail(repository, organization, ref, githubToken);
    if (!email) {
        core.setFailed(`Failed to set email for github user ${username}`);
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