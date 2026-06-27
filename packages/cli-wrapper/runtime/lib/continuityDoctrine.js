import { CONTRACT_ROLE_REGISTRATIONS, CORE_CONTINUITY_DOCTRINE_ROLE } from '@zachariahredfield/playbook-engine';
export const readContinuityDoctrineSummary = () => {
    const matches = CONTRACT_ROLE_REGISTRATIONS.filter((entry) => entry.role === CORE_CONTINUITY_DOCTRINE_ROLE);
    if (matches.length === 1) {
        const [entry] = matches;
        return {
            role: CORE_CONTINUITY_DOCTRINE_ROLE,
            path: entry.path,
            export_path: entry.exportPath,
            registration_state: 'registered'
        };
    }
    return {
        role: CORE_CONTINUITY_DOCTRINE_ROLE,
        path: null,
        export_path: null,
        registration_state: matches.length === 0 ? 'missing' : 'ambiguous'
    };
};
//# sourceMappingURL=continuityDoctrine.js.map