export const migrationsAppendOnlyRule = {
    id: 'migrationsAppendOnly',
    description: 'Fail when configured migration files are modified, renamed or deleted instead of appended.',
    check: ({ failure }) => failure.id === 'migrationsAppendOnly',
    policy: {
        id: 'migrationsAppendOnly',
        description: 'Require applied migrations to stay immutable; schema changes ship as new migration files.'
    },
    explanation: 'Applied migrations have already run against real databases. Editing one in place makes the repo history disagree with deployed state, so configured migration globs may only gain new files.',
    remediation: [
        'Revert the edit to the applied migration file.',
        'Create a new migration that makes the change instead of editing an applied one.'
    ]
};
//# sourceMappingURL=migrationsAppendOnlyRule.js.map