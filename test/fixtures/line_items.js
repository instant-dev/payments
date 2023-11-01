module.exports = [
  {
    "name": "execution_time",
    "display_name": "Execution time",
    "description": "The amount of time your functions run for, measured in GB of RAM multiplied by number of seconds.",
    "type": "usage",
    "settings": {
      "price": {
        "usd": 500
      },
      "unit_name": "GB-s",
      "units": 1000,
      "free_units": 100
    }
  },
  {
    "name": "ai_agent",
    "display_name": "Pearl (AI Agent)",
    "description": "Amount of included usage of Pearl, your AI assistant.",
    "type": "flag",
    "settings": {
      "value": 5,
      "display_value": "5 messages per month"
    }
  },
  {
    "name": "collaborator_seats",
    "display_name": "Team seats",
    "description": "The number of team members that can actively collaborate on projects for this account.",
    "type": "capacity",
    "settings": {
      "price": {
        "usd": 2000
      },
      "included_count": 1
    }
  },
  {
    "name": "projects",
    "display_name": "Projects",
    "description": "The number of active (non-archived) projects you can work on at a time",
    "type": "capacity",
    "settings": {
      "price": {
        "usd": 500
      },
      "included_count": 10
    }
  },
  {
    "name": "environments",
    "display_name": "Environments per project",
    "description": "The number of development environments that you can work on per project, e.g. dev, staging. Releases don\'t count towards this number.",
    "type": "capacity",
    "settings": {
      "price": {
        "usd": 500
      },
      "included_count": 1
    }
  },
  {
    "name": "linked_apps",
    "display_name": "Linked resources per app",
    "description": "The maximum number of active resources you can link per app. Adding capacity increases your limit for all apps at once.",
    "type": "capacity",
    "settings": {
      "price": {
        "usd": 500
      },
      "included_count": 1
    }
  },
  {
    "name": "hostnames",
    "display_name": "Hostnames",
    "description": "Use these to route domains like api.my-project.com to your APIs.",
    "type": "capacity",
    "settings": {
      "price": {
        "usd": 200
      },
      "included_count": 0
    }
  },
  {
    "name": "timeout",
    "display_name": "Timeout maximum",
    "description": "The maximum amount of time your endpoints can execute for.",
    "type": "flag",
    "settings": {
      "value": 30000,
      "display_value": "30s"
    }
  },
  {
    "name": "memory",
    "display_name": "Maximum RAM",
    "description": "Maximum RAM available for your endpoint.",
    "type": "flag",
    "settings": {
      "value": 512,
      "display_value": "512 MB"
    }
  },
  {
    "name": "custom_tokens",
    "display_name": "Custom tokens",
    "description": "The number of custom API tokens you can create.",
    "type": "flag",
    "settings": {
      "value": 3,
      "display_value": "3"
    }
  },
  {
    "name": "log_retention",
    "display_name": "Log retention",
    "description": "The number of days we retain your function execution logs.",
    "type": "flag",
    "settings": {
      "value": 1,
      "display_value": "1 day"
    }
  },
  {
    "name": "support",
    "display_name": "Support",
    "description": "The level of support you have from the Autocode team.",
    "type": "flag",
    "settings": {
      "value": 0,
      "display_value": "Community support"
    }
  }
];
