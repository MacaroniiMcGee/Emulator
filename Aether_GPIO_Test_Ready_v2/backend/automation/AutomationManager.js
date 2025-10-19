// automation/AutomationManager.js
const path = require('path');
const AutomationStorage = require('./AutomationStorage');

class AutomationManager {
  constructor(gpioEvents) {
    this.gpioEvents = gpioEvents;
    this.rules = new Map();
    this.stats = {
      totalTriggers: 0,
      ruleExecutions: new Map()
    };
    this.timers = new Map();
    
    // Use AutomationStorage with correct path
    const rulesPath = path.join(__dirname, '../data/automation-rules.json');
    this.storage = new AutomationStorage(rulesPath);
    
    console.log(`[Automation] Storage initialized: ${rulesPath}`);
  }

  async initialize() {
    // Load saved rules using AutomationStorage
    await this.loadRules();
    
    // Set up GPIO event listener
    this.gpioEvents.on('gpio_change', (data) => {
      this.handleGPIOChange(data);
    });
    
    // Start scheduled rule checker
    this.scheduleInterval = setInterval(() => {
      this.checkScheduledRules();
    }, 60000); // Check every minute
    
    console.log(`[Automation] Initialized with ${this.rules.size} rules`);
  }

  async loadRules() {
    try {
      const rulesArray = await this.storage.loadRules();
      
      // Clear existing rules
      this.rules.clear();
      
      // Load rules into Map
      rulesArray.forEach(rule => {
        this.rules.set(rule.id, rule);
        this.stats.ruleExecutions.set(rule.id, 0);
      });
      
      console.log(`[Automation] ✓ Loaded ${rulesArray.length} rules from storage`);
      return rulesArray.length;
    } catch (err) {
      console.error('[Automation] ✗ Error loading rules:', err.message);
      return 0;
    }
  }

  async saveRules() {
    try {
      const rulesArray = Array.from(this.rules.values());
      await this.storage.saveRules(rulesArray);
      console.log(`[Automation] ✓ Saved ${rulesArray.length} rules`);
    } catch (err) {
      console.error('[Automation] ✗ Error saving rules:', err.message);
    }
  }

  addRule(rule) {
    const id = rule.id || `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newRule = {
      id,
      name: rule.name || 'Unnamed Rule',
      description: rule.description || '',
      enabled: rule.enabled !== false,
      priority: rule.priority || 100,
      conditions: rule.conditions || { all: [] },
      actions: rule.actions || [],
      createdAt: rule.createdAt || Date.now()
    };
    
    this.rules.set(id, newRule);
    this.stats.ruleExecutions.set(id, 0);
    this.saveRules();
    
    console.log(`[Automation] ✓ Added rule: ${newRule.name} (${id})`);
    return id;
  }

  removeRule(id) {
    if (!this.rules.has(id)) {
      throw new Error(`Rule ${id} not found`);
    }
    const rule = this.rules.get(id);
    this.rules.delete(id);
    this.stats.ruleExecutions.delete(id);
    this.clearTimer(id);
    this.saveRules();
    
    console.log(`[Automation] ✓ Removed rule: ${rule.name} (${id})`);
  }

  updateRule(id, updates) {
    const rule = this.rules.get(id);
    if (!rule) {
      throw new Error(`Rule ${id} not found`);
    }
    Object.assign(rule, updates);
    this.saveRules();
    
    console.log(`[Automation] ✓ Updated rule: ${rule.name} (${id})`);
  }

  enableRule(id) {
    const rule = this.rules.get(id);
    if (!rule) {
      throw new Error(`Rule ${id} not found`);
    }
    rule.enabled = true;
    this.saveRules();
    
    console.log(`[Automation] ✓ Enabled rule: ${rule.name} (${id})`);
  }

  disableRule(id) {
    const rule = this.rules.get(id);
    if (!rule) {
      throw new Error(`Rule ${id} not found`);
    }
    rule.enabled = false;
    this.clearTimer(id);
    this.saveRules();
    
    console.log(`[Automation] ✓ Disabled rule: ${rule.name} (${id})`);
  }

  getRules() {
    return Array.from(this.rules.values());
  }

  getStats() {
    return {
      totalTriggers: this.stats.totalTriggers,
      totalRules: this.rules.size,
      activeRules: Array.from(this.rules.values()).filter(r => r.enabled).length,
      executions: Object.fromEntries(this.stats.ruleExecutions)
    };
  }

  handleGPIOChange(data) {
    const { pin, value } = data;
    
    console.log(`[Automation] GPIO change detected: pin ${pin} = ${value}`);
    
    let matchedRules = 0;
    this.rules.forEach((rule) => {
      if (!rule.enabled) return;
      
      // Check if rule matches this GPIO change
      if (this.checkConditions(rule.conditions, { event: 'gpio_change', pin, value })) {
        matchedRules++;
        this.executeRule(rule, data);
      }
    });
    
    if (matchedRules === 0) {
      console.log(`[Automation] No rules matched GPIO ${pin} = ${value}`);
    }
  }

  checkScheduledRules() {
    const now = new Date();
    
    this.rules.forEach((rule) => {
      if (!rule.enabled) return;
      
      if (rule.conditions?.schedule) {
        if (this.shouldTriggerSchedule(rule.conditions.schedule, now)) {
          this.executeRule(rule, { time: now.toISOString() });
        }
      }
    });
  }

  shouldTriggerSchedule(schedule, now) {
    const { time, days } = schedule;
    
    if (days && days.length > 0) {
      const dayOfWeek = now.getDay();
      if (!days.includes(dayOfWeek)) return false;
    }
    
    if (time) {
      const [hours, minutes] = time.split(':').map(Number);
      return now.getHours() === hours && now.getMinutes() === minutes;
    }
    
    return false;
  }

  checkConditions(conditions, eventData) {
    if (!conditions) return true;
    
    // Handle "all" conditions (AND)
    if (conditions.all) {
      return conditions.all.every(cond => {
        if (cond.event === 'gpio_change') {
          return eventData.event === 'gpio_change' &&
                 eventData.pin === cond.pin &&
                 (cond.value === undefined || eventData.value === cond.value);
        }
        return true;
      });
    }
    
    // Handle "any" conditions (OR)
    if (conditions.any) {
      return conditions.any.some(cond => {
        if (cond.event === 'gpio_change') {
          return eventData.event === 'gpio_change' &&
                 eventData.pin === cond.pin &&
                 (cond.value === undefined || eventData.value === cond.value);
        }
        return true;
      });
    }
    
    return true;
  }

  async executeRule(rule, triggerData) {
    console.log(`[Automation] ⚡ Executing rule: ${rule.name}`);
    
    // Execute actions sequentially
    for (const action of rule.actions) {
      await this.executeAction(action, triggerData);
    }
    
    // Update stats
    this.stats.totalTriggers++;
    this.stats.ruleExecutions.set(
      rule.id, 
      (this.stats.ruleExecutions.get(rule.id) || 0) + 1
    );
    
    console.log(`[Automation] ✓ Rule completed: ${rule.name}`);
  }

  async executeAction(action, triggerData) {
    console.log(`[Automation] → Action: ${action.type}`, action.params);
    
    switch (action.type) {
      case 'log':
        const level = action.params?.level || 'info';
        const message = action.params?.message || 'Automation action';
        console.log(`[Automation] [${level.toUpperCase()}] ${message}`);
        break;
        
      case 'gpio':
        this.gpioEvents.emit('gpio_action', {
          pin: action.params.pin,
          value: action.params.value
        });
        
        // Auto-revert after duration if specified
        if (action.params.duration) {
          await new Promise(resolve => setTimeout(resolve, action.params.duration));
          this.gpioEvents.emit('gpio_action', {
            pin: action.params.pin,
            value: action.params.value === 1 ? 0 : 1
          });
        }
        break;
        
      case 'gpio_set':
        this.gpioEvents.emit('gpio_action', {
          pin: action.params.pin,
          value: action.params.value
        });
        break;
        
      case 'gpio_pulse':
        this.gpioEvents.emit('gpio_action', {
          pin: action.params.pin,
          value: 1
        });
        await new Promise(resolve => setTimeout(resolve, action.params.duration || 300));
        this.gpioEvents.emit('gpio_action', {
          pin: action.params.pin,
          value: 0
        });
        break;
        
      case 'delay':
        await new Promise(resolve => setTimeout(resolve, action.params.duration || 1000));
        break;
        
      default:
        console.log(`[Automation] ⚠ Unknown action type: ${action.type}`);
    }
  }

  clearTimer(id) {
    if (this.timers.has(id)) {
      clearTimeout(this.timers.get(id));
      this.timers.delete(id);
    }
  }

  async triggerEvent(event, data) {
    console.log(`[Automation] Manual trigger: ${event}`, data);
    if (event === 'gpio_change') {
      this.handleGPIOChange(data);
    }
  }

  shutdown() {
    console.log('[Automation] Shutting down...');
    if (this.scheduleInterval) {
      clearInterval(this.scheduleInterval);
    }
    this.timers.forEach(timer => clearTimeout(timer));
  }
}

module.exports = AutomationManager;
