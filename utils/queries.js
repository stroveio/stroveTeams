const gql = require('graphql-tag')

const userDataFragment = `
    projectId
    userId
    fullName
    photoUrl
    documentPath
    selections {
        start {
            line
            character
        }
        end{
            line
            character
        }
        active{
            line
            character
        }
        anchor{
            line
            character
        }
    }
    color
`;

exports.stroveLiveshareSubscription = gql`
subscription($userId: String!, $projectId: String!) {
    stroveLiveshare (userId: $userId, projectId: $projectId) {
      ${userDataFragment}
    }
  }
`;

exports.liveshareActivity = `
mutation($userData: UserActivityInput) {
    liveshareActivity (userData: $userData)
}
`;

exports.focusEditorSubscription = gql`
subscription($projectId: String!) {
    focusEditor(projectId: $projectId) {
        documentPath
        selections {
            start {
                line
                character
            }
            end {
                line
                character
            }
        }
    }
}
`;

exports.receiveTerminalSubscription = `
subscription($projectId: String!) {
    receiveTerminal(projectId: $projectId)
}
`;

exports.setProjectDataMutation = `
mutation($id: ID!, $testOutput: String) {
    setProjectData(id: $id, testOutput: $testOutput) {
        name
    }
}
`;

exports.receiveAutomaticTestSubscription = `
subscription($projectId: String!) {
    automaticTest(projectId: $projectId) {
            projectId
            userId
            folderName
            command
            testStartCommand    
    }
}
`;
