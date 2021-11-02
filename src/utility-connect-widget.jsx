import React, { useEffect, useState } from 'react';
import { useUtilityConnect } from '@arcadia-eng/utility-connect-react';
import { getUtilityConnectToken, deleteUser } from './session';

const UtilityConnectWidget = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [config, setConfig] = useState(null);
  const [successful, setSuccessful] = useState(false);
  const [error, setError] = useState(null);
  const [timedOut,  setTimedOut] = useState(false);
  const [utilityCredentialId, setUtilityCredentialId] = useState(null);

  // This is the hook for the Utility Connect Component
  const [{ loading, utilityConnectSetupError }, open] = useUtilityConnect();

  if (utilityConnectSetupError) {
    setError(utilityConnectSetupError.message);
  }

  // The first time this Component renders, we ask the server to fetch a Utility Connect Token from the Arcadia API
  useEffect(() => {
    getUtilityConnectToken()
      .then(utilityConnectToken => {
        // We configure the Component using the Utility Connect Token
        setConfig(generateConfig(utilityConnectToken));
      })
      .catch((e) => {
        setError(e.message);
      });
  }, []);

  const deleteUserAndReload = () => {
    deleteUser(() => window.location.reload(false));
  }

  const generateConfig = utilityConnectToken => {
    return {
      utilityConnectToken,
      env: 'sandbox',
      callbacks: {
        // Called each time the Utility Connect Component is opened.
        onOpen: () => {
          setModalOpen(true);
        },
        onCredentialsSubmitted: ({ utilityCredentialId }) => {
          setUtilityCredentialId(utilityCredentialId);
        },
        // Called each time the Utility Connect Component is closed.
        onClose: ({ status }) => {
          switch (status) {
            // A user submitted their credentials and those credentials were verified during the regular course of the Component's user experience
            case "verified":
              setSuccessful(true);
              break;
            // A user submitted their credentials but they could not be verified in a reasonable amount of time before the Component redirected the user back to your app.
            // Credentials will still be verified in the background, but if your receive a UtilityCredentialRejected webhook, you'll need to prompt this user to enter the Utility Connect process again.
            case "timed_out":
              setSuccessful(true);
              setTimedOut(true);
              break;
            default:
              break;
          };

          setModalOpen(false);
        },
        // Called if there was a catastrophic error when submitting the user's credential
        onError: ({ error }) => {
          setError(error);
        },
      },
      poll: {
        timeout: 30000,
      },
      uiTheme: 'dark',
    };
  };

  if (modalOpen) return null;

  if (error) {
    return <p>Uh oh! We hit a problem: {error} </p>;
  }

  if (timedOut) {
    return <p>Utility Credential #{utilityCredentialId} was created but the credentials weren't verified before the Component timed out and closed. The credentials will be verified in the background. If you've configured a webhook, check your console for incoming webhooks about verification.</p>
  }

  if (successful) {
    return (
      <div>
        <p>You have connected Utility Credential #{utilityCredentialId}! If you've configured a webhook, check your console for incoming data.</p>
        <p>In order to try connecting these same credentials, you must delete the user associated with the credentials first:</p>
        <button type="button" onClick={() => deleteUserAndReload()}>
          Delete User and Reload
        </button>
      </div>
    )
  }

  return (
    // When the button is clicked, we call the Utility Connect Component's open method in order to display the modal
    <button type="button" disabled={loading || !config} onClick={() => open(config)}>
      Launch Utility Connect Component
    </button>
  );
};

export default UtilityConnectWidget;
