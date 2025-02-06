RULES YOU MUST FOLLOW
- I do not want you to change any code that doesn't fix the problem.
- I do not want you to optimize the code unless I tell you to do so.
- I do not want you to clean up the code unless I tell you to do so.
- Do not make code changes until you discuss a plan with me.
- Do not remove spaces or blank lines unless I tell you to do so.
- Do not change a single line of code that is not specifically related to the issue we are solving.
- If you need to change things in more than one file, stop and ask me if you should continue.
- Do not break existing code.
- If you have questions or suggestions, ask me.

HOW WE CODE
- We are developing modules for FoundryVTT version 12, but want to be code ready for version 13.
- Foundryvtt v12 is at https://foundryvtt.com/api/v12/
- Foundryvtt v13 is at https://foundryvtt.com/api/v13/
- We want to leverage the APP V2 API for Foundryvtt which can be found at https://foundryvtt.wiki/en/development/api/applicationv2
- We are developing for D&D5E based on https://github.com/foundryvtt/dnd5e/wiki
- For socket communications we are using socketlib library found at https://github.com/manuelVo/foundryvtt-socketlib
- We are using libwrapper to avoid conflicts with other modules found at https://github.com/ruipin/fvtt-lib-wrapper
- This module is part of the Coffee Pub system found at https://github.com/Drowbe
- This module will use the Coffee Pub Blacksmith library and API which is responsible for managing the registration of Coffee Pub modules and the communication between them. Deatils are in README-API.md
- ALways use postConsoleAndNotification from global.js instead of console.log and console.info
- Append "MODULENAME | " to errors and warnings sent to console.error and console.warn where MODULENAME is the name of the module.
- Always start with a plan before changing any code.

- Only ever change the code we need to change.
- Do not clean up unrelated code unless asked to do so.
- it is important that we focus on specific changes so we know what works and what breaks
- Ask me questions when appropriate
