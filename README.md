# Slack User
## Overview
A lightweight GitHub Action that can be used to fetch a user's slack username for usage in automated slack notifications by their associated username. This action works by taking the username in GitHub retrieving the user's email associated with the GitHub account, and then finding a slack user that's associated with that email. If one is found the slack username for that user is set as the output variable.

## Inputs
* username - This should match the github.actor property of the job that is using this action.
* github-token - This is the authentication token used in the github context that will give this action access to the github user
* slack-token - This is the API Key for the Camis Slack Instance. It will allow us to fetch a list of slack users and from there determine their slack id.

## Outputs
* slack-id - the username of the slack user associated with the GitHub email, can be used to mention the user in various automated notifications.