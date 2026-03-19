import { PreTokenGenerationV2Event } from 'aws-lambda';

export const handler = async (event: PreTokenGenerationV2Event): Promise<PreTokenGenerationV2Event> => {
  const role = event.request.userAttributes['custom:role'] || 'user';
  event.response = {
    claimsAndScopeOverrideDetails: {
      idTokenGeneration: {
        claimsToAddOrOverride: { role },
        claimsToSuppress: [],
      },
      accessTokenGeneration: {
        claimsToAddOrOverride: { role },
        claimsToSuppress: [],
        scopesToAdd: [],
        scopesToSuppress: [],
      },
    },
  };
  return event;
};
