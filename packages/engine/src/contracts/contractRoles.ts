export const CORE_CONTINUITY_DOCTRINE_ROLE = 'core_continuity_doctrine' as const;

export type ContractArtifactRole = typeof CORE_CONTINUITY_DOCTRINE_ROLE;

export type ContractRoleRegistration = {
  role: ContractArtifactRole;
  path: string;
  exportPath: string;
};

export const CONTRACT_ROLE_REGISTRATIONS: readonly ContractRoleRegistration[] = [
  {
    role: CORE_CONTINUITY_DOCTRINE_ROLE,
    path: 'docs/contracts/PLAYBOOK-CONTRACT.md',
    exportPath: 'exports/playbook.contract.example.v1.json'
  }
] as const;

const getContractRoleRegistrationForPath = (artifactPath: string): ContractRoleRegistration | undefined =>
  CONTRACT_ROLE_REGISTRATIONS.find((entry) => entry.path === artifactPath);

export const getContractArtifactRoleForPath = (artifactPath: string): ContractArtifactRole | undefined =>
  getContractRoleRegistrationForPath(artifactPath)?.role;

export const getContractArtifactExportPathForPath = (artifactPath: string): string | undefined =>
  getContractRoleRegistrationForPath(artifactPath)?.exportPath;

export const isContractArtifactRole = (value: unknown): value is ContractArtifactRole =>
  value === CORE_CONTINUITY_DOCTRINE_ROLE;

export const normalizeContractArtifactRoles = (
  roles: ReadonlyArray<ContractArtifactRole>
): ContractArtifactRole[] => [...new Set(roles)].sort((left, right) => left.localeCompare(right));

export const normalizeContractArtifactExportPaths = (
  exportPaths: ReadonlyArray<string>
): string[] => [...new Set(exportPaths)].sort((left, right) => left.localeCompare(right));

export const getContractArtifactRolesForPaths = (
  artifactPaths: ReadonlyArray<string>
): ContractArtifactRole[] => {
  const roles = new Set<ContractArtifactRole>();
  for (const artifactPath of artifactPaths) {
    const role = getContractArtifactRoleForPath(artifactPath);
    if (role) {
      roles.add(role);
    }
  }

  return normalizeContractArtifactRoles([...roles]);
};

export const getContractArtifactExportPathsForPaths = (
  artifactPaths: ReadonlyArray<string>
): string[] => {
  const exportPaths = new Set<string>();
  for (const artifactPath of artifactPaths) {
    const exportPath = getContractArtifactExportPathForPath(artifactPath);
    if (exportPath) {
      exportPaths.add(exportPath);
    }
  }

  return normalizeContractArtifactExportPaths([...exportPaths]);
};
