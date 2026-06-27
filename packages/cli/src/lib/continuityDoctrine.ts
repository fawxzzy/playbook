import {
  CONTRACT_ROLE_REGISTRATIONS,
  CORE_CONTINUITY_DOCTRINE_ROLE
} from '@zachariahredfield/playbook-engine';

export type ContinuityDoctrineSummary = {
  role: typeof CORE_CONTINUITY_DOCTRINE_ROLE;
  path: string | null;
  export_path: string | null;
  registration_state: 'registered' | 'missing' | 'ambiguous';
};

export const readContinuityDoctrineSummary = (): ContinuityDoctrineSummary => {
  const matches = CONTRACT_ROLE_REGISTRATIONS.filter(
    (entry: { role: string; path: string; exportPath: string }) => entry.role === CORE_CONTINUITY_DOCTRINE_ROLE
  );

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
