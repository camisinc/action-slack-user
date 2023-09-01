# Slack User

## Overview

A lightweight GitHub Action that can be used to fetch a user's slack member id for usage in automated slack notifications by their associated GitHub username.

This action works by taking the username in GitHub retrieving the user's email associated with the GitHub account, and then finding a slack user that's associated with that email.

If one is found the slack member id for that user is set as the output variable.

## Inputs

* github-token - This is the authentication token used in the github context that will give this action access to the github user
* slack-token - This is the API Key for a Slack Instance. It will allow us to fetch a list of slack users and from there determine their slack id.

## Outputs

* member-id - the member id of the slack user associated with the GitHub email.
* username - the username of the slack user associated with the GitHub email.
