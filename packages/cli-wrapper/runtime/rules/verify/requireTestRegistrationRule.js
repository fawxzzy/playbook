export const requireTestRegistrationRule = {
    id: 'requireTestRegistration',
    description: 'Fail when a newly added test file is not listed in any configured CI test list.',
    check: ({ failure }) => failure.id === 'requireTestRegistration',
    policy: {
        id: 'requireTestRegistration',
        description: 'Require every new test file to be listed where CI picks up its tests.'
    },
    explanation: 'When CI runs an explicit list of test files, a new test that is not on the list never runs, so it can pass review while proving nothing. Only newly added test files are checked; tests that already exist unlisted are left alone.',
    remediation: [
        'Add the new test file path to one of the CI test lists named in the fix.',
        'If CI already runs the whole folder, list that folder as a glob under "covered" in the rule config.'
    ]
};
//# sourceMappingURL=requireTestRegistrationRule.js.map