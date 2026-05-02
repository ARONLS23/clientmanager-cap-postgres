using {arrows.cap.cli as cli} from '../db/schema';

service ManagerClientService {
    entity Clients        as projection on cli.Client;
    entity Projects       as projection on cli.Project;
    entity ProjectMembers as projection on cli.ProjectMember;
    entity Tasks          as projection on cli.Task;

    entity Documents      as
        projection on cli.Document {
            ID,
            name,
            type,
            url,
            description,
            mediaType,
            size,
            project,
            createdAt,
            createdBy,
            modifiedAt,
            modifiedBy
        };

    type DocumentContent {
        fileName  : String;
        mediaType : String;
        content   : String;
    }

    action   uploadProjectDocument(projectId: UUID, fileName: String, mediaType: String, size: Integer, description: String, content: LargeBinary) returns Documents;

    function getProjectDocumentContent(documentId: UUID)                                                                                           returns DocumentContent;

    function getToken()                                                                                                                            returns String;
}
