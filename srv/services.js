const cds = require('@sap/cds');

class ManagerClientService extends cds.ApplicationService {
    init() {
        this.on('getToken', this._getToken);

        this.on("uploadProjectDocument", this._uploadProjectDocument);
        this.on("getProjectDocumentContent", this._getProjectDocumentContent);

        return super.init();
    }

    _getToken(req) {
        const token = req._.req.headers.authorization;
        return token || 'No token found';
    }

    async _uploadProjectDocument(req) {
        const { projectId, fileName, mediaType, size, description, content } = req.data;

        if (!projectId) {
            return req.error(400, "projectId is required.");
        }

        if (!fileName) {
            return req.error(400, "fileName is required.");
        }

        if (!content) {
            return req.error(400, "content is required.");
        }

        const tx = cds.tx(req);

        const { Project, Document } = cds.entities("arrows.cap.cli");
        const { Documents } = this.entities;

        const project = await tx.run(
            SELECT.one.from(Project)
                .columns("ID")
                .where({ ID: projectId })
        );

        if (!project) {
            return req.error(404, "Project not found.");
        }

        const documentId = cds.utils.uuid();
        const documentContent = await this._normalizeBinaryContent(content);
        const normalizedMediaType = mediaType || "application/octet-stream";
        const documentType = this._getFileType(fileName, normalizedMediaType);

        await tx.run(
            INSERT.into(Document).entries({
                ID: documentId,
                name: fileName,
                type: documentType,
                url: this._buildDocumentUrl(documentId),
                description: description || "",
                mediaType: normalizedMediaType,
                size: size || documentContent.length,
                content: documentContent,
                project_ID: projectId
            })
        );

        return tx.run(
            SELECT.one.from(Documents)
                .columns(
                    "ID",
                    "name",
                    "type",
                    "url",
                    "description",
                    "mediaType",
                    "size",
                    "project_ID",
                    "createdAt",
                    "createdBy",
                    "modifiedAt",
                    "modifiedBy"
                )
                .where({ ID: documentId })
        );
    }

    async _getProjectDocumentContent(req) {
        const { documentId } = req.data;

        if (!documentId) {
            return req.error(400, "documentId is required.");
        }

        const tx = cds.tx(req);
        const { Document } = cds.entities("arrows.cap.cli");

        const document = await tx.run(
            SELECT.one.from(Document)
                .columns("ID", "name", "mediaType", "content")
                .where({ ID: documentId })
        );

        if (!document) {
            return req.error(404, "Document not found.");
        }

        if (!document.content) {
            return req.error(404, "Document content not found.");
        }

        const contentBuffer = await this._normalizeBinaryContent(document.content);

        return {
            fileName: document.name,
            mediaType: document.mediaType || "application/octet-stream",
            content: contentBuffer.toString("base64")
        };
    }

    async _normalizeBinaryContent(content) {
        if (typeof content === "string") {
            const base64Content = content.includes(",")
                ? content.split(",").pop()
                : content;

            return Buffer.from(base64Content, "base64");
        }

        if (content && typeof content.pipe === "function") {
            const chunks = [];

            for await (const chunk of content) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }

            return Buffer.concat(chunks);
        }

        return Buffer.from(content);
    }

    _buildDocumentUrl(documentId) {
        return `/odata/v4/manager-client/getProjectDocumentContent(documentId=${documentId})`;
    }

    _getFileType(fileName, mediaType) {
        const extension = this._getFileExtension(fileName);

        const extensionTypes = {
            PDF: "PDF",
            DOC: "Word",
            DOCX: "Word",
            XLS: "Excel",
            XLSX: "Excel",
            PPT: "PowerPoint",
            PPTX: "PowerPoint",
            PNG: "Imagen",
            JPG: "Imagen",
            JPEG: "Imagen",
            TXT: "Texto",
            ZIP: "Comprimido"
        };

        if (extension && extensionTypes[extension]) {
            return extensionTypes[extension];
        }

        if (mediaType) {
            return mediaType;
        }

        return extension || "Archivo";
    }

    _getFileExtension(fileName) {
        if (!fileName || !fileName.includes(".")) {
            return "";
        }

        return fileName.split(".").pop().toUpperCase();
    }
}

module.exports = ManagerClientService;