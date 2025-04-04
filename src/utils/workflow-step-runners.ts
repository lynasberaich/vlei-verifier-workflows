import { VerifierClient } from 'vlei-verifier-client';

import { VleiIssuance } from '../vlei-issuance.js';
import { VleiVerification } from '../vlei-verification.js';
import {
  presentationStatusMapping,
  authorizationStatusMapping,
} from './test-data.js';
import {
  getAgentSecret,
  getIdentifierData,
  IdentifierData,
  MultisigIdentifierData,
  SinglesigIdentifierData,
} from './handle-json-config.js';
import { WorkflowState } from '../workflow-state.js';
import { resolveEnvironment } from './resolve-env.js';
import { getRootOfTrust, getIssuedCredential } from './test-util.js';

export abstract class StepRunner {
  type = '';
  public abstract run( // considering most overriden versions of this method do not use either stepName or configJson, this method signature should be reexamined
    stepName: string,
    step: any,
    configJson: any
  ): Promise<any>;
}

export class CreateClientStepRunner extends StepRunner {
  type = 'create_client';
  public async run(
    _stepName: string,
    step: any,
    configJson: any = null
  ): Promise<any> {
    const agentName = step.agent_name;
    const secret = getAgentSecret(configJson, agentName);
    const result = await VleiIssuance.createClient(secret, agentName);
    return result;
  }
}

export class CreateAidStepRunner extends StepRunner {
  type = 'create_aid';
  public async run(
    _stepName: string,
    step: any,
    configJson: any = null
  ): Promise<any> {
    const identifierData: IdentifierData = getIdentifierData(
      configJson,
      step.aid
    );
    const result = await VleiIssuance.createAid(identifierData);
    return result;
  }
}

export class CreateRegistryStepRunner extends StepRunner {
  type = 'create_registry';
  public async run(
    _stepName: string,
    step: any,
    configJson: any = null
  ): Promise<any> {
    const identifierData: IdentifierData = getIdentifierData(
      configJson,
      step.aid
    );
    const result = await VleiIssuance.createRegistry(identifierData);
    return result;
  }
}

export class IssueCredentialStepRunner extends StepRunner {
  type = 'issue_credential';
  public async run(
    stepName: string,
    step: any,
    _configJson: any = null
  ): Promise<any> {
    const result = await VleiIssuance.getOrIssueCredential(
      stepName,
      step.credential,
      step.attributes,
      step.issuer_aid,
      step.issuee_aid,
      step.credential_source,
      Boolean(step.generate_test_data),
      step.test_name
    );

    if (step.verify_retrieval) {
      console.log(`Verifying role-based credential retrieval...`);

      const role =
        result.cred.sad.a.engagementContextRole ||
        result.cred.sad.a.officialRole;

      if (!role) {
        console.log(`No role found in credential, skipping verification`);
        return result;
      }

      console.log(`Attempting to retrieve credential by role: "${role}"`);

      const retrievedCred = await getIssuedCredential(
        step.issuer_aid,
        step.issuee_aid,
        step.credential_source,
        step.credential,
        role
      );

      if (!retrievedCred) {
        throw new Error(`Failed to retrieve credential with role "${role}"`);
      }

      // Verify it's the same credential
      if (retrievedCred.sad.d !== result.cred.sad.d) {
        throw new Error(
          `Retrieved wrong credential! Expected SAID ${result.cred.sad.d}, got ${retrievedCred.sad.d}`
        );
      }

      console.log(
        `✅ Successfully verified role-based credential retrieval for role "${role}"`
      );
    }

    return result;
  }
}

export class RevokeCredentialStepRunner extends StepRunner {
  type = 'revoke_credential';
  public async run(
    _stepName: string,
    step: any,
    _configJson: any = null
  ): Promise<any> {
    const result = await VleiIssuance.revokeCredential(
      step.credential,
      step.issuer_aid,
      step.issuee_aid,
      Boolean(step.generate_test_data),
      step.test_name
    );
    return result;
  }
}

export class NotifyCredentialIssueeStepRunner extends StepRunner {
  type = 'notify_credential_issuee';
  public async run(
    _stepName: string,
    step: any,
    _configJson: any = null
  ): Promise<any> {
    const result = await VleiIssuance.notifyCredentialIssuee(
      step.credential,
      step.issuer_aid,
      step.issuee_aid
    );
    return result;
  }
}

export class VleiVerificationStepRunner extends StepRunner {
  type = 'vlei_verification';
  public async run(
    _stepName: string,
    step: any,
    configJson: any = null
  ): Promise<any> {
    const workflow_state = WorkflowState.getInstance();
    const vleiVerification = new VleiVerification();
    let cred;
    let credCesr;
    for (const action of Object.values(step.actions) as any[]) {
      if (action.type == 'credential_presentation') {
        const presenterAid = action.presenter_aid;
        if (presenterAid) {
          const aidInfo = workflow_state.aidsInfo.get(presenterAid);
          let client;
          if (
            aidInfo !== undefined &&
            aidInfo.type !== undefined &&
            aidInfo.type == 'multisig'
          ) {
            const multisigIdentifierData = aidInfo as MultisigIdentifierData;
            const multisigMemberAidInfo = workflow_state.aidsInfo.get(
              multisigIdentifierData.identifiers[0]
            ) as SinglesigIdentifierData;
            client = workflow_state.clients.get(
              multisigMemberAidInfo.agent.name
            );
          } else {
            const singlesigIdentifierData = aidInfo as SinglesigIdentifierData;
            client = workflow_state.clients.get(
              singlesigIdentifierData.agent.name
            );
          }
          const credential = workflow_state.credentials.get(action.credential);
          if (!credential) {
            throw new Error(`Credential not found: ${action.credential}`);
          }
          cred = credential.cred;
          if (!cred || !cred.sad || !cred.sad.d) {
            throw new Error(
              `Invalid credential format for: ${action.credential}`
            );
          }
          credCesr =
            client !== undefined
              ? await client.credentials().get(cred.sad.d, true)
              : undefined;
        } else {
          const credential = workflow_state.credentials.get(action.credential);
          if (!credential) {
            throw new Error(`Credential not found: ${action.credential}`);
          }
          cred = credential.cred;
          if (!cred || !cred.sad || !cred.sad.d) {
            throw new Error(
              `Invalid credential format for: ${action.credential}`
            );
          }
          credCesr = credential.credCesr;
        }

        if (!credCesr) {
          throw new Error(
            `Credential CESR data not found for: ${action.credential}`
          );
        }

        //console.log('Credential retrieved:', JSON.stringify(credential, null, 2));
        //console.log('Credential cred property:', JSON.stringify(cred, null, 2));

        const credStatus = presentationStatusMapping.get(
          action.expected_status
        );
        await vleiVerification.credentialPresentation(
          cred,
          credCesr,
          credStatus
        );
      } else if (action.type == 'credential_authorization') {
        const aidPrefix = workflow_state.aids.get(action.aid).prefix;
        const credStatus = authorizationStatusMapping.get(
          action.expected_status
        );
        await vleiVerification.credentialAuthorization(aidPrefix, credStatus);
      } else if (action.type == 'aid_presentation') {
        const aidPrefix = workflow_state.aids.get(action.aid).prefix;
        const aidInfo = workflow_state.aidsInfo.get(action.aid)!;
        let identifierData: SinglesigIdentifierData;
        if (aidInfo.type == 'singlesig') {
          identifierData = getIdentifierData(
            configJson,
            action.aid
          ) as SinglesigIdentifierData;
        } else {
          const multisigIdentifierData: MultisigIdentifierData =
            getIdentifierData(configJson, action.aid) as MultisigIdentifierData;
          identifierData = getIdentifierData(
            configJson,
            multisigIdentifierData.identifiers[0]
          ) as SinglesigIdentifierData;
        }
        const client = workflow_state.clients.get(identifierData.agent.name);
        const oobi = await client.oobis().get(action.aid);
        let oobiUrl = oobi.oobis[0];
        const url = new URL(oobiUrl);
        if (url.hostname === 'keria')
          oobiUrl = oobiUrl.replace('keria', 'localhost');
        const oobiResp = await fetch(oobiUrl);
        const aidCesr = await oobiResp.text();
        const aidStatus = presentationStatusMapping.get(action.expected_status);
        await vleiVerification.aidPresentation(aidPrefix, aidCesr, aidStatus);
      } else if (action.type == 'aid_authorization') {
        const aidPrefix = workflow_state.aids.get(action.aid).prefix;
        const aidStatus = authorizationStatusMapping.get(
          action.expected_status
        );
        await vleiVerification.aidAuthorization(aidPrefix, aidStatus);
      } else {
        throw new Error(`vlei_verification: Invalid action: ${action.type} `);
      }
    }
    return true;
  }
}

export class AddRootOfTrustStepRunner extends StepRunner {
  type = 'add_root_of_trust';

  public async run(
    _stepName: string,
    step: any,
    configJson: any
  ): Promise<any> {
    const env = resolveEnvironment();
    const rot_aid = step.rot_aid;
    const rot_member_aid = step.rot_member_aid;
    const rootOfTrustData = await getRootOfTrust(
      configJson,
      rot_aid,
      rot_member_aid
    );
    const verifierClient = new VerifierClient(env.verifierBaseUrl);
    const response = await verifierClient.addRootOfTrust(
      rootOfTrustData.aid,
      rootOfTrustData.vlei,
      rootOfTrustData.oobi
    );

    return response;
  }
}

export class VerifyCredentialFilterStepRunner extends StepRunner {
  type = 'verify_credential_filter';

  public async run(_stepName: string, step: any): Promise<any> {
    const workflow_state = WorkflowState.getInstance();
    const credential = workflow_state.credentials.get(step.credential_id);

    if (!credential || !credential.cred) {
      throw new Error(`Credential not found: ${step.credential_id}`);
    }

    const actualRole =
      credential.cred.sad.a.engagementContextRole ||
      credential.cred.sad.a.officialRole;

    console.log(
      `Verifying credential ${step.credential_id} has role "${step.expected_role}"`
    );
    console.log(`Actual role: "${actualRole}"`);

    if (actualRole !== step.expected_role) {
      throw new Error(
        `Role mismatch: expected "${step.expected_role}", got "${actualRole}"`
      );
    }

    return true;
  }
}
