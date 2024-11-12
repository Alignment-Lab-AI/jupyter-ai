import React, { useEffect, useState, useMemo } from 'react';
import { Box } from '@mui/system';
import {
  Alert,
  Button,
  IconButton,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  Tooltip,
  CircularProgress
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { Select } from './select';
import { AiService } from '../handler';
import { ModelFields } from './settings/model-fields';
import { ServerInfoState, useServerInfo } from './settings/use-server-info';
import { ExistingApiKeys } from './settings/existing-api-keys';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { minifyUpdate } from './settings/minify';
import { useStackingAlert } from './mui-extras/stacking-alert';
import { RendermimeMarkdown } from './rendermime-markdown';
import { IJaiCompletionProvider } from '../tokens';

type ChatSettingsProps = {
  rmRegistry: IRenderMimeRegistry;
  completionProvider: IJaiCompletionProvider | null;
  openInlineCompleterSettings: () => void;
};

export function ChatSettings(props: ChatSettingsProps): JSX.Element {
  const server = useServerInfo();
  const alert = useStackingAlert();
  const apiKeysAlert = useStackingAlert();

  // Provider states
  const [selectedLmProviderId, setSelectedLmProviderId] = useState<string | null>(null);
  const [selectedClmProviderId, setSelectedClmProviderId] = useState<string | null>(null);
  const [selectedEmProviderId, setSelectedEmProviderId] = useState<string | null>(null);

  // Model name states
  const [lmModelName, setLmModelName] = useState('');
  const [clmModelName, setClmModelName] = useState('');
  const [emModelName, setEmModelName] = useState('');

  // Help text states
  const [chatHelpMarkdown, setChatHelpMarkdown] = useState<string | null>(null);
  const [completionHelpMarkdown, setCompletionHelpMarkdown] = useState<string | null>(null);

  // Global IDs
  const lmGlobalId = useMemo(() => 
    selectedLmProviderId && lmModelName ? `${selectedLmProviderId}:${lmModelName}` : null,
    [selectedLmProviderId, lmModelName]
  );

  const clmGlobalId = useMemo(() => 
    selectedClmProviderId && clmModelName ? `${selectedClmProviderId}:${clmModelName}` : null,
    [selectedClmProviderId, clmModelName]
  );

  const emGlobalId = useMemo(() => 
    selectedEmProviderId && emModelName ? `${selectedEmProviderId}:${emModelName}` : null,
    [selectedEmProviderId, emModelName]
  );

  // Other states
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [sendWse, setSendWse] = useState(false);
  const [fields, setFields] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const [isCompleterEnabled, setIsCompleterEnabled] = useState(
    props.completionProvider && props.completionProvider.isEnabled()
  );

  // Initialize state from server
  useEffect(() => {
    if (server.state !== ServerInfoState.Ready) return;

    const [lmPid, lmModel] = server.chat.lmGlobalId?.split(':') ?? [null, ''];
    const [clmPid, clmModel] = server.completions.lmGlobalId?.split(':') ?? [null, ''];
    const [emPid, emModel] = server.config.embeddings_provider_id?.split(':') ?? [null, ''];

    setSelectedLmProviderId(lmPid);
    setSelectedClmProviderId(clmPid);
    setSelectedEmProviderId(emPid);

    setLmModelName(lmModel);
    setClmModelName(clmModel);
    setEmModelName(emModel);

    setSendWse(server.config.send_with_shift_enter);
    
    // Only set fields if they exist
    if (server.config.fields?.[server.chat.lmGlobalId ?? '']) {
      setFields(server.config.fields[server.chat.lmGlobalId ?? '']);
    }
  }, [server]);

  // Completer state management
  useEffect(() => {
    const refreshCompleterState = () => {
      setIsCompleterEnabled(
        props.completionProvider && props.completionProvider.isEnabled()
      );
    };
    props.completionProvider?.settingsChanged.connect(refreshCompleterState);
    return () => {
      props.completionProvider?.settingsChanged.disconnect(refreshCompleterState);
    };
  }, [props.completionProvider]);

  const handleSave = async () => {
    if (server.state !== ServerInfoState.Ready) return;

    // Only include API keys that have values
    const validApiKeys: Record<string, string> = {};
    Object.entries(apiKeys).forEach(([key, value]) => {
      if (value.trim()) {
        validApiKeys[key] = value;
      }
    });

    let updateRequest: AiService.UpdateConfigRequest = {
      model_provider_id: lmGlobalId,
      embeddings_provider_id: emGlobalId,
      completions_model_provider_id: clmGlobalId,
      send_with_shift_enter: sendWse,
      // Only include fields and API keys if they exist
      ...(Object.keys(fields).length > 0 && {
        fields: {
          ...(lmGlobalId && { [lmGlobalId]: fields }),
          ...(clmGlobalId && { [clmGlobalId]: fields })
        }
      }),
      ...(Object.keys(validApiKeys).length > 0 && { api_keys: validApiKeys })
    };

    updateRequest = minifyUpdate(server.config, updateRequest);
    updateRequest.last_read = server.config.last_read;

    setSaving(true);
    try {
      await apiKeysAlert.clear();
      await AiService.updateConfig(updateRequest);
      await server.refetchAll();
      alert.show('success', 'Settings saved successfully.');
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error || typeof e === 'string'
        ? e.toString()
        : 'An unknown error occurred. Check the console for more details.';
      alert.show('error', msg);
    } finally {
      setSaving(false);
    }
  };

  if (server.state === ServerInfoState.Loading) {
    return (
      <Box sx={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around'
      }}>
        <CircularProgress />
      </Box>
    );
  }

  if (server.state === ServerInfoState.Error) {
    return (
      <Box sx={{
        width: '100%',
        height: '100%',
        padding: 4,
        boxSizing: 'border-box'
      }}>
        <Alert severity="error">
          {server.error || 'An unknown error occurred. Check the console for more details.'}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{
      padding: '0 12px 12px',
      boxSizing: 'border-box',
      '& .MuiAlert-root': { marginTop: 2 },
      overflowY: 'auto'
    }}>
      <h2 className="jp-ai-ChatSettings-header">Language Model</h2>
      <Box>
        <Select
          value={selectedLmProviderId || ''}
          label="Provider"
          onChange={e => {
            const providerId = e.target.value || null;
            setSelectedLmProviderId(providerId);
            if (!providerId) setLmModelName('');
          }}
        >
          <MenuItem value="">None</MenuItem>
          {server.lmProviders.providers.map(provider => (
            <MenuItem key={provider.id} value={provider.id}>
              {provider.name}
            </MenuItem>
          ))}
        </Select>

        {selectedLmProviderId && (
          <TextField
            label="Model Name"
            value={lmModelName}
            onChange={e => setLmModelName(e.target.value)}
            fullWidth
            margin="normal"
          />
        )}

        {lmGlobalId && (
          <ModelFields
            fields={server.lmProviders.providers.find(p => p.id === selectedLmProviderId)?.fields}
            values={fields}
            onChange={setFields}
          />
        )}
      </Box>

      <h2 className="jp-ai-ChatSettings-header">Embedding Model</h2>
      <Box>
        <Select
          value={selectedEmProviderId || ''}
          label="Provider"
          onChange={e => {
            const providerId = e.target.value || null;
            setSelectedEmProviderId(providerId);
            if (!providerId) setEmModelName('');
          }}
        >
          <MenuItem value="">None</MenuItem>
          {server.emProviders.providers.map(provider => (
            <MenuItem key={provider.id} value={provider.id}>
              {provider.name}
            </MenuItem>
          ))}
        </Select>

        {selectedEmProviderId && (
          <TextField
            label="Model Name"
            value={emModelName}
            onChange={e => setEmModelName(e.target.value)}
            fullWidth
            margin="normal"
          />
        )}
      </Box>

      <h2 className="jp-ai-ChatSettings-header">
        Inline Completions Model
        <CompleterSettingsButton
          provider={props.completionProvider}
          openSettings={props.openInlineCompleterSettings}
          isCompleterEnabled={isCompleterEnabled}
          hasSelection={!!selectedClmProviderId}
        />
      </h2>
      <Box>
        <Select
          value={selectedClmProviderId || ''}
          label="Provider"
          disabled={!isCompleterEnabled}
          onChange={e => {
            const providerId = e.target.value || null;
            setSelectedClmProviderId(providerId);
            if (!providerId) setClmModelName('');
          }}
        >
          <MenuItem value="">None</MenuItem>
          {server.lmProviders.providers.map(provider => (
            <MenuItem key={provider.id} value={provider.id}>
              {provider.name}
            </MenuItem>
          ))}
        </Select>

        {selectedClmProviderId && (
          <TextField
            label="Model Name"
            value={clmModelName}
            onChange={e => setClmModelName(e.target.value)}
            fullWidth
            margin="normal"
            disabled={!isCompleterEnabled}
          />
        )}

        {clmGlobalId && (
          <ModelFields
            fields={server.lmProviders.providers.find(p => p.id === selectedClmProviderId)?.fields}
            values={fields}
            onChange={setFields}
          />
        )}
      </Box>

      <h2 className="jp-ai-ChatSettings-header">API Keys</h2>
      <ExistingApiKeys
        alert={apiKeysAlert}
        apiKeys={server.config.api_keys}
        onSuccess={server.refetchApiKeys}
      />

      <h2 className="jp-ai-ChatSettings-header">Input</h2>
      <FormControl>
        <FormLabel id="send-radio-buttons-group-label">
          When writing a message, press <kbd>Enter</kbd> to:
        </FormLabel>
        <RadioGroup
          aria-labelledby="send-radio-buttons-group-label"
          value={sendWse ? 'newline' : 'send'}
          name="send-radio-buttons-group"
          onChange={e => setSendWse(e.target.value === 'newline')}
        >
          <FormControlLabel
            value="send"
            control={<Radio />}
            label="Send the message"
          />
          <FormControlLabel
            value="newline"
            control={<Radio />}
            label={
              <>
                Start a new line (use <kbd>Shift</kbd>+<kbd>Enter</kbd> to send)
              </>
            }
          />
        </RadioGroup>
      </FormControl>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </Box>
      {alert.jsx}
    </Box>
  );
}

function CompleterSettingsButton(props: {
  provider: IJaiCompletionProvider | null;
  isCompleterEnabled: boolean | null;
  hasSelection: boolean;
  openSettings: () => void;
}): JSX.Element {
  if (props.hasSelection && !props.isCompleterEnabled) {
    return (
      <Tooltip
        title={
          'A completer model is selected, but ' +
          (props.provider === null
            ? 'the completion provider plugin is not available.'
            : 'the inline completion provider is not enabled in the settings: click to open settings.')
        }
      >
        <IconButton onClick={props.openSettings}>
          <WarningAmberIcon />
        </IconButton>
      </Tooltip>
    );
  }
  return (
    <Tooltip title="Completer settings">
      <IconButton onClick={props.openSettings}>
        <SettingsIcon />
      </IconButton>
    </Tooltip>
  );
}

export default ChatSettings;
