import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Activity, Settings, FileText, PlayCircle, Circle } from 'lucide-react';

async function postGpio(ip, pin, value) {
  try {
    await fetch(`http://${ip}:3001/api/gpio/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, value })
    });
  } catch (e) {
    console.error('GPIO write failed', e);
  }
}

const IOAccessEmulator = () => {
  const [connected, setConnected] = useState(false);
  const [ipAddress, setIpAddress] = useState('');
  const [activeTab, setActiveTab] = useState('control');
  const [reportTab, setReportTab] = useState('audit');

  // I/O States
  const [inputs, setInputs] = useState([
    { id: 1, name: 'Input 1', type: 'REX-Button', gpio: 17, active: false },
    { id: 2, name: 'Input 2', type: 'Entry Sensor', gpio: 18, active: false },
    { id: 3, name: 'Input 3', type: 'Lock Sensor', gpio: 27, active: false },
    { id: 4, name: 'Input 4', type: 'REX-Button', gpio: 22, active: false },
    { id: 5, name: 'Input 5', type: 'Entry Sensor', gpio: 23, active: false },
    { id: 6, name: 'Input 6', type: 'Safety Beam', gpio: 24, active: false },
    { id: 7, name: 'Input 7', type: 'General', gpio: 25, active: false },
    { id: 8, name: 'Input 8', type: 'General', gpio: 5, active: false }
  ]);

  const [outputs, setOutputs] = useState([
    { id: 1, name: 'Output 1', type: 'Strike Follower', gpio: 6, active: false },
    { id: 2, name: 'Output 2', type: 'Auto Door', gpio: 13, active: false },
    { id: 3, name: 'Output 3', type: 'Sounder', gpio: 19, active: false },
    { id: 4, name: 'Output 4', type: 'Strike', gpio: 26, active: false },
    { id: 5, name: 'Output 5', type: 'Strobe', gpio: 12, active: false },
    { id: 6, name: 'Output 6', type: 'FAI', gpio: 16, active: false },
    { id: 7, name: 'Output 7', type: 'General', gpio: 20, active: false },
    { id: 8, name: 'Output 8', type: 'General', gpio: 21, active: false }
  ]);

  const [controllerOutputs, setControllerOutputs] = useState([
    { id: 1, name: 'Controller Output 1', type: 'Strike', gpio: 2, active: false },
    { id: 2, name: 'Controller Output 2', type: 'Lock', gpio: 3, active: false },
    { id: 3, name: 'Controller Output 3', type: 'Sounder', gpio: 4, active: false },
    { id: 4, name: 'Controller Output 4', type: 'Strobe', gpio: 7, active: false }
  ]);

  // Door States
  const [doors, setDoors] = useState([
    {
      id: 1, name: 'Door 1',
      readerIn: { gpio: 8, d0: 8, d1: 9, active: false },
      readerOut: { gpio: 10, d0: 10, d1: 11, active: false },
      lock: { gpio: 14, active: false },
      dps: { gpio: 15, active: false },
      rexIn: { gpio: 17, active: false },
      generalOutput: { gpio: 18, active: false },
      faiSignal: { gpio: 22, active: false }
    },
    {
      id: 2, name: 'Door 2',
      readerIn: { gpio: 23, d0: 23, d1: 24, active: false },
      readerOut: { gpio: 25, d0: 25, d1: 26, active: false },
      lock: { gpio: 27, active: false },
      dps: { gpio: 5, active: false },
      rexIn: { gpio: 6, active: false },
      generalOutput: { gpio: 12, active: false },
      faiSignal: { gpio: 13, active: false }
    }
  ]);

  // Wiegand Card Simulation
  const [wiegandFormat, setWiegandFormat] = useState('26');
  const [facilityCode, setFacilityCode] = useState('123');
  const [cardNumber, setCardNumber] = useState('12345');
  const [selectedDoor, setSelectedDoor] = useState(1);
  const [selectedReader, setSelectedReader] = useState('in');

  // Emulation
  const [emulationSequence, setEmulationSequence] = useState([]);
  const [isEmulating, setIsEmulating] = useState(false);
  const [sequenceName, setSequenceName] = useState('');
  const [savedSequences, setSavedSequences] = useState([]);
  const [emulationType, setEmulationType] = useState('io');

  // Automation
  const [automationRules, setAutomationRules] = useState([]);
  const [automationStats, setAutomationStats] = useState({});

  // Logs
  const [auditLog, setAuditLog] = useState([]);
  const [emulationLog, setEmulationLog] = useState([]);
  const [systemLog, setSystemLog] = useState([]);

  // Fetch automation data
  const fetchAutomationRules = async () => {
    if (!connected) return;
    try {
      const response = await fetch(`http://${ipAddress}:3001/api/automation/rules`);
      const data = await response.json();
      if (data.success) {
        setAutomationRules(data.rules);
      }
    } catch (err) {
      console.error('Failed to fetch automation rules:', err);
    }
  };

  const fetchAutomationStats = async () => {
    if (!connected) return;
    try {
      const response = await fetch(`http://${ipAddress}:3001/api/automation/stats`);
      const data = await response.json();
      if (data.success) {
        setAutomationStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch automation stats:', err);
    }
  };

  // Polling effect for automation stats
  useEffect(() => {
    let interval;
    if (connected) {
      interval = setInterval(fetchAutomationStats, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [connected, ipAddress]);

  // Connect/Disconnect
  const handleConnect = async () => {
    if (!connected) {
      if (ipAddress) {
        try {
          const response = await fetch(`http://${ipAddress}:3001/api/health`);
          if (response.ok) {
            setConnected(true);
            logSystem('success', `Connected to ${ipAddress}`);
            // Fetch automation data
            fetchAutomationRules();
            fetchAutomationStats();
          }
        } catch (err) {
          logSystem('error', `Failed to connect to ${ipAddress}`);
        }
      }
    } else {
      setConnected(false);
      logSystem('info', 'Disconnected');
    }
  };

  // Toggle Input
  const toggleInput = async (id) => {
    if (!connected) return;
    const input = inputs.find(i => i.id === id);
    const newState = !input.active;
    
    await postGpio(ipAddress, input.gpio, newState ? 1 : 0);
    setInputs(prev => prev.map(i => i.id === id ? { ...i, active: newState } : i));
    logSystem('io', `${input.name} (GPIO ${input.gpio}) ${newState ? 'ACTIVATED' : 'DEACTIVATED'}`);
  };

  const toggleOutput = async (id) => {
    if (!connected) return;
    const output = outputs.find(o => o.id === id);
    const newState = !output.active;
    
    await postGpio(ipAddress, output.gpio, newState ? 1 : 0);
    setOutputs(prev => prev.map(o => o.id === id ? { ...o, active: newState } : o));
    logSystem('io', `${output.name} (GPIO ${output.gpio}) ${newState ? 'ENGAGED' : 'RELEASED'}`);
  };

  const toggleControllerOutput = async (id) => {
    if (!connected) return;
    const output = controllerOutputs.find(o => o.id === id);
    const newState = !output.active;
    
    await postGpio(ipAddress, output.gpio, newState ? 1 : 0);
    setControllerOutputs(prev => prev.map(o => o.id === id ? { ...o, active: newState } : o));
    logSystem('io', `${output.name} (GPIO ${output.gpio}) ${newState ? 'ENGAGED' : 'RELEASED'}`);
  };

  // Door Control
  const toggleDoorIO = async (doorId, ioType) => {
    if (!connected) return;
    const door = doors.find(d => d.id === doorId);
    const newState = !door[ioType].active;
    
    await postGpio(ipAddress, door[ioType].gpio, newState ? 1 : 0);
    setDoors(prev => prev.map(d => d.id === doorId ? {
      ...d,
      [ioType]: { ...d[ioType], active: newState }
    } : d));
    logSystem('io', `${door.name} ${ioType.toUpperCase()} (GPIO ${door[ioType].gpio}) ${newState ? 'ACTIVATED' : 'DEACTIVATED'}`);
  };

  // Wiegand Card Send
  const sendWiegandCard = async () => {
    if (!connected) return;
    const door = doors.find(d => d.id === selectedDoor);
    const readerGpio = selectedReader === 'in' ? door.readerIn.gpio : door.readerOut.gpio;
    
    logSystem('io', `Sending ${wiegandFormat}-bit card to ${door.name} Reader ${selectedReader.toUpperCase()}: FC=${facilityCode}, Card=${cardNumber}`);
    logEmulation(`Wiegand Card: FC=${facilityCode}, Card=${cardNumber} on ${door.name}`);
    
    await postGpio(ipAddress, readerGpio, 1);
    setTimeout(async () => {
      await postGpio(ipAddress, readerGpio, 0);
    }, 500);
  };

  const generateRandomCard = () => {
    const randomFC = Math.floor(Math.random() * 255) + 1;
    const randomCard = Math.floor(Math.random() * 65535) + 1;
    setFacilityCode(randomFC.toString());
    setCardNumber(randomCard.toString());
    logAudit(`Generated random card: FC=${randomFC}, Card=${randomCard}`);
  };

  // Emulation Builder
  const addEmulationStep = () => {
    if (emulationType === 'door') {
      setEmulationSequence(prev => [...prev, {
        id: Date.now(),
        type: 'door',
        doorId: 1,
        eventType: 'lock',
        action: 'activate',
        delay: 1000
      }]);
    } else {
      setEmulationSequence(prev => [...prev, {
        id: Date.now(),
        type: 'io',
        ioType: 'input',
        ioId: 1,
        action: 'activate',
        delay: 1000
      }]);
    }
  };

  const removeEmulationStep = (id) => {
    setEmulationSequence(prev => prev.filter(step => step.id !== id));
  };

  const updateEmulationStep = (id, field, value) => {
    setEmulationSequence(prev => prev.map(step =>
      step.id === id ? { ...step, [field]: value } : step
    ));
  };

  const runEmulation = async () => {
    if (!connected || isEmulating) return;
    setIsEmulating(true);
    logEmulation('Emulation sequence started');
    
    for (const step of emulationSequence) {
      await new Promise(resolve => setTimeout(resolve, step.delay));
      
      if (step.type === 'door') {
        toggleDoorIO(step.doorId, step.eventType);
        logEmulation(`${step.action.toUpperCase()} Door ${step.doorId} ${step.eventType.toUpperCase()}`);
      } else {
        if (step.ioType === 'input') {
          toggleInput(step.ioId);
          logEmulation(`${step.action.toUpperCase()} Input ${step.ioId}`);
        } else if (step.ioType === 'output') {
          toggleOutput(step.ioId);
          logEmulation(`${step.action.toUpperCase()} Output ${step.ioId}`);
        } else if (step.ioType === 'controller') {
          toggleControllerOutput(step.ioId);
          logEmulation(`${step.action.toUpperCase()} Controller Output ${step.ioId}`);
        }
      }
    }
    
    setIsEmulating(false);
    logEmulation('Emulation sequence completed');
  };

  const saveSequence = () => {
    if (!sequenceName.trim() || emulationSequence.length === 0) return;
    const newSequence = {
      id: Date.now(),
      name: sequenceName,
      steps: JSON.parse(JSON.stringify(emulationSequence)),
      createdAt: new Date().toLocaleString()
    };
    setSavedSequences(prev => [...prev, newSequence]);
    setSequenceName('');
    logAudit(`Saved emulation sequence: "${newSequence.name}"`);
  };

  const loadSequence = (sequence) => {
    setEmulationSequence(JSON.parse(JSON.stringify(sequence.steps)));
    logAudit(`Loaded emulation sequence: "${sequence.name}"`);
  };

  const deleteSequence = (id) => {
    const sequence = savedSequences.find(s => s.id === id);
    if (sequence) {
      setSavedSequences(prev => prev.filter(s => s.id !== id));
      logAudit(`Deleted emulation sequence: "${sequence.name}"`);
    }
  };

  // Configuration
  const updateInput = (id, field, value) => {
    setInputs(prev => prev.map(input => 
      input.id === id ? { ...input, [field]: value } : input
    ));
    logAudit(`Modified Input ${id}: ${field} = ${value}`);
  };

  const updateOutput = (id, field, value) => {
    setOutputs(prev => prev.map(output => 
      output.id === id ? { ...output, [field]: value } : output
    ));
    logAudit(`Modified Output ${id}: ${field} = ${value}`);
  };

  const updateDoorName = (doorId, newName) => {
    setDoors(prev => prev.map(door => 
      door.id === doorId ? { ...door, name: newName } : door
    ));
    logAudit(`Renamed door ${doorId} to "${newName}"`);
  };

  const updateDoorIO = (doorId, ioType, field, value) => {
    setDoors(prev => prev.map(door => 
      door.id === doorId ? {
        ...door,
        [ioType]: { ...door[ioType], [field]: value }
      } : door
    ));
    logAudit(`Modified Door ${doorId} ${ioType}: ${field} = ${value}`);
  };

  // Logging
  const logAudit = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setAuditLog(prev => [{ time: timestamp, message }, ...prev].slice(0, 100));
  };

  const logEmulation = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setEmulationLog(prev => [{ time: timestamp, message }, ...prev].slice(0, 100));
  };

  const logSystem = (type, message) => {
    const timestamp = new Date().toLocaleTimeString();
    setSystemLog(prev => [{ time: timestamp, type, message }, ...prev].slice(0, 100));
  };

  const inputTypes = ['None', 'REX-Button', 'Entry Sensor', 'Lock Sensor', 'Safety Beam', 'DPS', 'AUX', 'General'];
  const outputTypes = ['None', 'Strike Follower', 'Lock', 'Auto Door', 'Sounder', 'Strobe', 'FAI', 'General'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              I/O Group Access Emulator
            </h1>
            <p className="text-slate-400 mt-1">Raspberry Pi GPIO Control Interface</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="localhost"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                disabled={connected}
                className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 w-48 disabled:opacity-50"
              />
              <button
                onClick={handleConnect}
                className={`px-6 py-2 rounded-lg font-semibold flex items-center gap-2 ${
                  connected ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {connected ? <WifiOff size={20} /> : <Wifi size={20} />}
                {connected ? 'Disconnect' : 'Connect'}
              </button>
            </div>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              connected ? 'bg-green-900/30 text-green-400' : 'bg-slate-800 text-slate-500'
            }`}>
              <Circle size={12} fill={connected ? 'currentColor' : 'none'} />
              {connected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-b border-slate-700 overflow-x-auto">
          {['control', 'doors', 'emulation', 'automation', 'config', 'reports'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 font-semibold relative whitespace-nowrap ${
                activeTab === tab ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab === 'control' && <Activity className="inline mr-2" size={20} />}
              {tab === 'doors' && <Activity className="inline mr-2" size={20} />}
              {tab === 'emulation' && <PlayCircle className="inline mr-2" size={20} />}
              {tab === 'automation' && <Activity className="inline mr-2" size={20} />}
              {tab === 'config' && <Settings className="inline mr-2" size={20} />}
              {tab === 'reports' && <FileText className="inline mr-2" size={20} />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        {activeTab === 'control' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse" />
                  Input Group
                </h2>
                <div className="space-y-3">
                  {inputs.map(input => (
                    <div key={input.id} className="bg-slate-900/50 rounded-lg p-4 border border-slate-600">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <div className={`w-4 h-4 rounded-full ${
                              input.active ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-slate-600'
                            }`} />
                            <div>
                              <div className="font-semibold">{input.name}</div>
                              <div className="text-xs text-slate-400">GPIO {input.gpio} • {input.type}</div>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleInput(input.id)}
                          disabled={!connected}
                          className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                            input.active ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-700 hover:bg-slate-600'
                          } disabled:opacity-30 disabled:cursor-not-allowed`}
                        >
                          {input.active ? 'ACTIVE' : 'INACTIVE'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
                  Output Group
                </h2>
                <div className="space-y-3">
                  {outputs.map(output => (
                    <div key={output.id} className="bg-slate-900/50 rounded-lg p-4 border border-slate-600">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <div className={`w-4 h-4 rounded-full ${
                              output.active ? 'bg-blue-500 shadow-lg shadow-blue-500/50' : 'bg-slate-600'
                            }`} />
                            <div>
                              <div className="font-semibold">{output.name}</div>
                              <div className="text-xs text-slate-400">GPIO {output.gpio} • {output.type}</div>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleOutput(output.id)}
                          disabled={!connected}
                          className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                            output.active ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-700 hover:bg-slate-600'
                          } disabled:opacity-30 disabled:cursor-not-allowed`}
                        >
                          {output.active ? 'ENGAGED' : 'RELEASED'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse" />
                Controller Based Outputs
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {controllerOutputs.map(output => (
                  <div key={output.id} className="bg-slate-900/50 rounded-lg p-4 border border-slate-600">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full ${
                            output.active ? 'bg-purple-500 shadow-lg shadow-purple-500/50' : 'bg-slate-600'
                          }`} />
                          <div>
                            <div className="font-semibold">{output.name}</div>
                            <div className="text-xs text-slate-400">GPIO {output.gpio} • {output.type}</div>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleControllerOutput(output.id)}
                        disabled={!connected}
                        className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                          output.active ? 'bg-purple-600 hover:bg-purple-700' : 'bg-slate-700 hover:bg-slate-600'
                        } disabled:opacity-30 disabled:cursor-not-allowed`}
                      >
                        {output.active ? 'RECEIVED' : 'IDLE'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'doors' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              {doors.map(door => (
                <div key={door.id} className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold">{door.name}</h2>
                    <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      door.lock.active ? 'bg-red-900/50 text-red-400' : 'bg-green-900/50 text-green-400'
                    }`}>
                      {door.lock.active ? 'LOCKED' : 'UNLOCKED'}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {['readerIn', 'readerOut', 'lock', 'dps', 'rexIn', 'generalOutput', 'faiSignal'].map(ioType => (
                      <div key={ioType} className="bg-slate-900/50 rounded-lg p-3 border border-slate-600">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${
                                door[ioType].active ? 'bg-cyan-500 shadow-lg shadow-cyan-500/50' : 'bg-slate-600'
                              }`} />
                              <div>
                                <div className="text-sm font-semibold">
                                  {ioType === 'readerIn' && 'Reader In'}
                                  {ioType === 'readerOut' && 'Reader Out'}
                                  {ioType === 'lock' && 'Lock'}
                                  {ioType === 'dps' && 'DPS'}
                                  {ioType === 'rexIn' && 'REX'}
                                  {ioType === 'generalOutput' && 'General Out'}
                                  {ioType === 'faiSignal' && 'FAI Signal'}
                                </div>
                                <div className="text-xs text-slate-400">GPIO {door[ioType].gpio}</div>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => toggleDoorIO(door.id, ioType)}
                            disabled={!connected}
                            className={`px-3 py-1 rounded text-xs font-semibold ${
                              door[ioType].active ? 'bg-cyan-600' : 'bg-slate-700'
                            } disabled:opacity-30`}
                          >
                            {door[ioType].active ? 'ACTIVE' : 'IDLE'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <div className="w-3 h-3 bg-cyan-500 rounded-full animate-pulse" />
                Wiegand Card Simulator
              </h2>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-slate-400 block mb-2">Select Door</label>
                    <select
                      value={selectedDoor}
                      onChange={(e) => setSelectedDoor(parseInt(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2"
                    >
                      {doors.map(door => (
                        <option key={door.id} value={door.id}>{door.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-slate-400 block mb-2">Select Reader</label>
                    <select
                      value={selectedReader}
                      onChange={(e) => setSelectedReader(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2"
                    >
                      <option value="in">Reader In</option>
                      <option value="out">Reader Out</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-slate-400 block mb-2">Wiegand Format</label>
                    <select
                      value={wiegandFormat}
                      onChange={(e) => setWiegandFormat(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2"
                    >
                      <option value="26">26-bit (Standard)</option>
                      <option value="30">30-bit</option>
                      <option value="34">34-bit</option>
                      <option value="37">37-bit</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-slate-400 block mb-2">Facility Code</label>
                    <input
                      type="number"
                      value={facilityCode}
                      onChange={(e) => setFacilityCode(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2"
                      min="0"
                      max="255"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-400 block mb-2">Card Number</label>
                    <input
                      type="number"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2"
                      min="0"
                      max="65535"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={generateRandomCard}
                      className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold"
                    >
                      Random Card
                    </button>
                    <button
                      onClick={sendWiegandCard}
                      disabled={!connected}
                      className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Send Card
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-4 p-4 bg-slate-900/50 rounded-lg border border-slate-600">
                <div className="text-sm text-slate-400">
                  <div className="font-semibold mb-2">Card Preview:</div>
                  <div className="font-mono">
                    Format: {wiegandFormat}-bit | FC: {facilityCode} | Card: {cardNumber}
                  </div>
                  <div className="text-xs mt-2">
                    Target: {doors.find(d => d.id === selectedDoor)?.name} - {selectedReader === 'in' ? 'Reader In' : 'Reader Out'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'emulation' && (
          <div className="space-y-6">
            <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
              <h2 className="text-2xl font-bold mb-4">Saved Sequences</h2>
              {savedSequences.length === 0 ? (
                <div className="bg-slate-900/50 rounded-lg p-8 text-center text-slate-400 border-2 border-dashed border-slate-600">
                  No saved sequences. Build and save a sequence below.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {savedSequences.map(seq => (
                    <div key={seq.id} className="bg-slate-900/50 rounded-lg p-4 border border-slate-600">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-bold">{seq.name}</h3>
                          <p className="text-xs text-slate-400">{seq.steps.length} steps • {seq.createdAt}</p>
                        </div>
                        <button onClick={() => deleteSequence(seq.id)} className="px-2 py-1 bg-red-600 rounded text-xs">Delete</button>
                      </div>
                      <button onClick={() => loadSequence(seq)} className="w-full mt-2 px-4 py-2 bg-blue-600 rounded-lg text-sm font-semibold">Load</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Sequence Builder</h2>
                <div className="flex gap-2">
                  <div className="flex gap-2 bg-slate-900 rounded-lg p-1 border border-slate-600">
                    <button
                      onClick={() => setEmulationType('io')}
                      className={`px-4 py-2 rounded font-semibold text-sm ${
                        emulationType === 'io' ? 'bg-blue-600' : 'bg-transparent text-slate-400'
                      }`}
                    >
                      I/O Emulation
                    </button>
                    <button
                      onClick={() => setEmulationType('door')}
                      className={`px-4 py-2 rounded font-semibold text-sm ${
                        emulationType === 'door' ? 'bg-cyan-600' : 'bg-transparent text-slate-400'
                      }`}
                    >
                      Door Emulation
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Sequence name..."
                    value={sequenceName}
                    onChange={(e) => setSequenceName(e.target.value)}
                    className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 w-48"
                  />
                  <button
                    onClick={saveSequence}
                    disabled={!sequenceName.trim() || emulationSequence.length === 0}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold disabled:opacity-30"
                  >
                    Save
                  </button>
                  <button onClick={addEmulationStep} className="px-4 py-2 bg-blue-600 rounded-lg font-semibold">+ Add Step</button>
                  <button
                    onClick={runEmulation}
                    disabled={!connected || isEmulating || emulationSequence.length === 0}
                    className="px-6 py-2 bg-green-600 rounded-lg font-semibold disabled:opacity-30 flex items-center gap-2"
                  >
                    <PlayCircle size={20} />
                    {isEmulating ? 'Running...' : 'Run'}
                  </button>
                </div>
              </div>

              {emulationSequence.length === 0 ? (
                <div className="bg-slate-900/50 rounded-lg p-12 text-center text-slate-400 border-2 border-dashed border-slate-600">
                  Click "Add Step" to build your {emulationType === 'door' ? 'door' : 'I/O'} sequence
                </div>
              ) : (
                <div className="space-y-3">
                  {emulationSequence.map((step, index) => (
                    <div key={step.id} className="bg-slate-900/50 rounded-lg p-4 border border-slate-600">
                      <div className="flex items-center gap-4">
                        <div className="text-slate-400 font-bold w-8">#{index + 1}</div>
                        
                        {step.type === 'door' ? (
                          <>
                            <select 
                              value={step.doorId} 
                              onChange={(e) => updateEmulationStep(step.id, 'doorId', parseInt(e.target.value))}
                              className="bg-slate-800 border border-slate-600 rounded px-3 py-2"
                            >
                              {doors.map(door => (
                                <option key={door.id} value={door.id}>{door.name}</option>
                              ))}
                            </select>

                            <select 
                              value={step.eventType} 
                              onChange={(e) => updateEmulationStep(step.id, 'eventType', e.target.value)}
                              className="bg-slate-800 border border-slate-600 rounded px-3 py-2 flex-1"
                            >
                              <option value="lock">Lock</option>
                              <option value="dps">DPS</option>
                              <option value="rexIn">REX</option>
                              <option value="readerIn">Reader In</option>
                              <option value="readerOut">Reader Out</option>
                              <option value="generalOutput">General Output</option>
                              <option value="faiSignal">FAI Signal</option>
                            </select>

                            <select 
                              value={step.action} 
                              onChange={(e) => updateEmulationStep(step.id, 'action', e.target.value)}
                              className="bg-slate-800 border border-slate-600 rounded px-3 py-2"
                            >
                              <option value="activate">Activate</option>
                              <option value="deactivate">Deactivate</option>
                            </select>
                          </>
                        ) : (
                          <>
                            <select 
                              value={step.ioType} 
                              onChange={(e) => { 
                                updateEmulationStep(step.id, 'ioType', e.target.value); 
                                updateEmulationStep(step.id, 'ioId', 1); 
                              }} 
                              className="bg-slate-800 border border-slate-600 rounded px-3 py-2"
                            >
                              <option value="input">Input</option>
                              <option value="output">Output</option>
                              <option value="controller">Controller</option>
                            </select>

                            <select 
                              value={step.ioId} 
                              onChange={(e) => updateEmulationStep(step.id, 'ioId', parseInt(e.target.value))} 
                              className="bg-slate-800 border border-slate-600 rounded px-3 py-2 flex-1"
                            >
                              {(step.ioType === 'input' ? inputs : step.ioType === 'output' ? outputs : controllerOutputs).map(io => (
                                <option key={io.id} value={io.id}>{io.name} (GPIO {io.gpio})</option>
                              ))}
                            </select>

                            <select 
                              value={step.action} 
                              onChange={(e) => updateEmulationStep(step.id, 'action', e.target.value)} 
                              className="bg-slate-800 border border-slate-600 rounded px-3 py-2"
                            >
                              <option value="activate">Activate</option>
                              <option value="deactivate">Deactivate</option>
                            </select>
                          </>
                        )}

                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            value={step.delay} 
                            onChange={(e) => updateEmulationStep(step.id, 'delay', parseInt(e.target.value))} 
                            className="bg-slate-800 border border-slate-600 rounded px-3 py-2 w-24" 
                            min="0" 
                            step="100" 
                          />
                          <span className="text-slate-400 text-sm">ms</span>
                        </div>
                        <button onClick={() => removeEmulationStep(step.id)} className="px-3 py-2 bg-red-600 rounded-lg">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'automation' && (
          <div className="space-y-6">
            <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <div className="w-3 h-3 bg-cyan-500 rounded-full animate-pulse" />
                Automation System
              </h2>
              
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-600">
                  <div className="text-slate-400 text-sm">Total Rules</div>
                  <div className="text-3xl font-bold text-blue-400">{automationRules.length}</div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-600">
                  <div className="text-slate-400 text-sm">Active Rules</div>
                  <div className="text-3xl font-bold text-green-400">
                    {automationRules.filter(r => r.enabled).length}
                  </div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-600">
                  <div className="text-slate-400 text-sm">Events Processed</div>
                  <div className="text-3xl font-bold text-cyan-400">
                    {automationStats.eventsProcessed || 0}
                  </div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-600">
                  <div className="text-slate-400 text-sm">Rules Executed</div>
                  <div className="text-3xl font-bold text-purple-400">
                    {automationStats.rulesExecuted || 0}
                  </div>
                </div>
              </div>

              {automationRules.length === 0 ? (
                <div className="bg-slate-900/50 rounded-lg p-12 text-center text-slate-400 border-2 border-dashed border-slate-600">
                  <p className="text-lg mb-2">No automation rules configured</p>
                  <p className="text-sm">Create automation rules using the backend API or rule files</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {automationRules.map((rule) => (
                    <div key={rule.id} className="bg-slate-900/50 rounded-lg p-4 border border-slate-600">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${
                              rule.enabled ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-slate-600'
                            }`} />
                            <div>
                              <div className="font-semibold">{rule.name}</div>
                              <div className="text-xs text-slate-400">
                                {rule.description}
                              </div>
                              <div className="text-xs text-slate-500 mt-1">
                                Priority: {rule.priority} • Executions: {rule.stats?.executions || 0}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className={`px-3 py-1 rounded text-xs font-semibold ${
                          rule.enabled ? 'bg-green-900/50 text-green-400' : 'bg-slate-700 text-slate-400'
                        }`}>
                          {rule.enabled ? 'ENABLED' : 'DISABLED'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
              <h3 className="text-xl font-bold mb-3">Quick Actions</h3>
              <div className="flex gap-3">
                <button
                  onClick={fetchAutomationRules}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold"
                >
                  Refresh Rules
                </button>
                <button
                  onClick={fetchAutomationStats}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-semibold"
                >
                  Refresh Stats
                </button>
              </div>
              <div className="mt-4 p-4 bg-slate-900/50 rounded-lg border border-slate-600">
                <div className="text-sm text-slate-400">
                  <p className="font-semibold mb-2">💡 Management Tip:</p>
                  <p>To add or modify automation rules, edit the <code className="bg-slate-800 px-2 py-1 rounded">automation-rules.json</code> file in your backend's <code className="bg-slate-800 px-2 py-1 rounded">data/</code> directory and restart the server.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'config' && (
          <div className="space-y-6">
            <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
              <h2 className="text-2xl font-bold mb-4">Input Configuration</h2>
              <div className="space-y-3">
                {inputs.map(input => (
                  <div key={input.id} className="bg-slate-900/50 rounded-lg p-4 border border-slate-600 grid grid-cols-4 gap-4">
                    <div>
                      <label className="text-xs text-slate-400">Name</label>
                      <input 
                        type="text" 
                        value={input.name} 
                        onChange={(e) => updateInput(input.id, 'name', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">Type</label>
                      <select 
                        value={input.type} 
                        onChange={(e) => updateInput(input.id, 'type', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm"
                      >
                        {inputTypes.map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">GPIO Pin</label>
                      <input 
                        type="number" 
                        value={input.gpio} 
                        onChange={(e) => updateInput(input.id, 'gpio', parseInt(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="flex items-end">
                      <div className={`px-3 py-1 rounded text-xs font-semibold ${input.active ? 'bg-green-600' : 'bg-slate-700'}`}>
                        {input.active ? 'ACTIVE' : 'INACTIVE'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
              <h2 className="text-2xl font-bold mb-4">Output Configuration</h2>
              <div className="space-y-3">
                {outputs.map(output => (
                  <div key={output.id} className="bg-slate-900/50 rounded-lg p-4 border border-slate-600 grid grid-cols-4 gap-4">
                    <div>
                      <label className="text-xs text-slate-400">Name</label>
                      <input 
                        type="text" 
                        value={output.name} 
                        onChange={(e) => updateOutput(output.id, 'name', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">Type</label>
                      <select 
                        value={output.type} 
                        onChange={(e) => updateOutput(output.id, 'type', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm"
                      >
                        {outputTypes.map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">GPIO Pin</label>
                      <input 
                        type="number" 
                        value={output.gpio} 
                        onChange={(e) => updateOutput(output.id, 'gpio', parseInt(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="flex items-end">
                      <div className={`px-3 py-1 rounded text-xs font-semibold ${output.active ? 'bg-blue-600' : 'bg-slate-700'}`}>
                        {output.active ? 'ENGAGED' : 'RELEASED'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
              <h2 className="text-2xl font-bold mb-4">Door Configuration</h2>
              <div className="space-y-6">
                {doors.map(door => (
                  <div key={door.id} className="bg-slate-900/50 rounded-lg p-6 border border-slate-600">
                    <div className="mb-4">
                      <label className="text-sm text-slate-400 block mb-1">Door Name</label>
                      <input 
                        type="text" 
                        value={door.name} 
                        onChange={(e) => updateDoorName(door.id, e.target.value)} 
                        className="w-full bg-slate-800 border border-slate-600 rounded px-4 py-2"
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Lock GPIO</label>
                        <input 
                          type="number" 
                          value={door.lock.gpio} 
                          onChange={(e) => updateDoorIO(door.id, 'lock', 'gpio', parseInt(e.target.value))} 
                          className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">DPS GPIO</label>
                        <input 
                          type="number" 
                          value={door.dps.gpio} 
                          onChange={(e) => updateDoorIO(door.id, 'dps', 'gpio', parseInt(e.target.value))} 
                          className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">REX GPIO</label>
                        <input 
                          type="number" 
                          value={door.rexIn.gpio} 
                          onChange={(e) => updateDoorIO(door.id, 'rexIn', 'gpio', parseInt(e.target.value))} 
                          className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Reader In GPIO</label>
                        <input 
                          type="number" 
                          value={door.readerIn.gpio} 
                          onChange={(e) => updateDoorIO(door.id, 'readerIn', 'gpio', parseInt(e.target.value))} 
                          className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="flex gap-2">
              <button 
                onClick={() => setReportTab('audit')} 
                className={`px-4 py-2 rounded-lg font-semibold ${reportTab === 'audit' ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                Audit Log
              </button>
              <button 
                onClick={() => setReportTab('emulation')} 
                className={`px-4 py-2 rounded-lg font-semibold ${reportTab === 'emulation' ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                Emulation Log
              </button>
              <button 
                onClick={() => setReportTab('system')} 
                className={`px-4 py-2 rounded-lg font-semibold ${reportTab === 'system' ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                System Events
              </button>
            </div>
            <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">
                  {reportTab === 'audit' && 'Audit Log'}
                  {reportTab === 'emulation' && 'Emulation Log'}
                  {reportTab === 'system' && 'System Events'}
                </h2>
                <button 
                  onClick={() => {
                    if (reportTab === 'audit') setAuditLog([]);
                    if (reportTab === 'emulation') setEmulationLog([]);
                    if (reportTab === 'system') setSystemLog([]);
                  }} 
                  className="px-4 py-2 bg-red-600 rounded-lg text-sm font-semibold"
                >
                  Clear
                </button>
              </div>
              <div className="bg-slate-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
                {reportTab === 'audit' && auditLog.length === 0 && (
                  <div className="text-slate-500 text-center py-12">No audit entries</div>
                )}
                {reportTab === 'audit' && auditLog.map((log, i) => (
                  <div key={i} className="flex gap-4 text-xs mb-1">
                    <span className="text-slate-500">{log.time}</span>
                    <span className="text-yellow-400">[AUDIT]</span>
                    <span className="text-slate-300">{log.message}</span>
                  </div>
                ))}
                {reportTab === 'emulation' && emulationLog.length === 0 && (
                  <div className="text-slate-500 text-center py-12">No emulation logs</div>
                )}
                {reportTab === 'emulation' && emulationLog.map((log, i) => (
                  <div key={i} className="flex gap-4 text-xs mb-1">
                    <span className="text-slate-500">{log.time}</span>
                    <span className="text-purple-400">[EMULATION]</span>
                    <span className="text-slate-300">{log.message}</span>
                  </div>
                ))}
                {reportTab === 'system' && systemLog.length === 0 && (
                  <div className="text-slate-500 text-center py-12">No system events</div>
                )}
                {reportTab === 'system' && systemLog.map((log, i) => (
                  <div key={i} className="flex gap-4 text-xs mb-1">
                    <span className="text-slate-500">{log.time}</span>
                    <span className={
                      log.type === 'success' ? 'text-green-400' : 
                      log.type === 'error' ? 'text-red-400' : 'text-cyan-400'
                    }>
                      [{log.type.toUpperCase()}]
                    </span>
                    <span className="text-slate-300">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default IOAccessEmulator;
