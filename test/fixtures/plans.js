module.exports = [
  {
    "name": "free_plan",
    "display_name": "Limited",
    "enabled": true,
    "visible": true,
    "price": null,
    "line_items_settings": {
      "execution_time": {},
      "collaborator_seats": {
        "included_count": 2
      },
      "linked_apps": {
        "included_count": 1
      },
      "hostnames": {
        "included_count": 0
      }
    }
  },
  {
    "name": "standard_plan",
    "display_name": "Standard",
    "enabled": true,
    "visible": true,
    "price": {
      "usd": 1900
    },
    "line_items_settings": {
      "execution_time": {
        "price": {
          "usd": 50
        },
        "units": 1000,
        "free_units": 0
      },
      "ai_agent": {
        "value": 1000000,
        "display_value": "Unlimited"
      },
      "collaborator_seats": {
        "price": {
          "usd": 5000
        },
        "included_count": 2
      },
      "projects": {
        "price": null
      },
      "environments": {
        "price": null
      },
      "linked_apps": {
        "price": null
      },
      "hostnames": {
        "price": null
      },
      "timeout": {
        "value": 120000,
        "display_value": "120s"
      },
      "custom_tokens": {
        "value": 100,
        "display_value": "100"
      },
      "memory": {
        "value": 3096,
        "display_value": "3 GB"
      }
    }
  },
  {
    "name": "business_plan",
    "display_name": "Business",
    "enabled": true,
    "visible": true,
    "price": {
      "usd": 24900
    },
    "line_items_settings": {
      "execution_time": {
        "price": {
          "usd": 20
        },
        "units": 1000,
        "free_units": 0
      },
      "ai_agent": {
        "value": 1000000,
        "display_value": "Unlimited"
      },
      "collaborator_seats": {
        "price": {
          "usd": 5000
        },
        "included_count": 5
      },
      "projects": {
        "price": null
      },
      "environments": {
        "price": null
      },
      "linked_apps": {
        "price": null
      },
      "hostnames": {
        "price": null
      },
      "timeout": {
        "value": 600000,
        "display_value": "600s"
      },
      "custom_tokens": {
        "value": 100,
        "display_value": "100"
      },
      "log_retention": {
        "value": 7,
        "display_value": "7 days"
      },
      "support": {
        "value": 2,
        "display_value": "Dedicated support"
      },
      "memory": {
        "value": 10240,
        "display_value": "10 GB"
      }
    }
  }
];
