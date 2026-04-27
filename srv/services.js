const cds = require('@sap/cds');

class ManagerClientService extends cds.ApplicationService {
    init() {
        this.on('getToken', this._getToken);
        return super.init();
    }

    _getToken(req) {
        const token = req._.req.headers.authorization;
        return token || 'No token found';
    }
}

module.exports = ManagerClientService;